-- =====================================================================
-- DAIC-12 · Búsqueda en base de conocimiento · Agente IA Comercial Dicampo
-- Supabase del CRM (Postgres 17) · pgvector + full-text search en español
-- Búsqueda híbrida con Reciprocal Rank Fusion (RRF)
--
-- Vive en el esquema `kb`, FUERA de `public`: Prisma gestiona `public` y una
-- migración futura propondría borrar cualquier tabla que no esté en
-- schema.prisma. Las funciones quedan en `public` (Prisma no gestiona
-- funciones) para que n8n las llame por RPC igual que antes.
-- Las extensiones van en `extensions`, como recomienda Supabase.
-- =====================================================================

create schema if not exists kb;

-- 1. Extensiones -------------------------------------------------------
create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;

-- 2. Configuración de texto: español sin tildes -------------------------
-- "envío" y "envio" deben coincidir; los clientes escriben sin tildes.
do $$
begin
  if not exists (
    select 1 from pg_ts_config c join pg_namespace n on n.oid = c.cfgnamespace
    where c.cfgname = 'es_sin_acentos' and n.nspname = 'kb'
  ) then
    create text search configuration kb.es_sin_acentos (copy = pg_catalog.spanish);
    alter text search configuration kb.es_sin_acentos
      alter mapping for hword, hword_part, word
      with extensions.unaccent, spanish_stem;
  end if;
end $$;

-- 3. Tabla de fragmentos -----------------------------------------------
create table if not exists kb.fragmentos (
  id             bigint generated always as identity primary key,
  documento_id   text        not null,              -- id estable del documento origen
  orden          int         not null,              -- posición del fragmento en el documento
  fuente         text        not null,              -- nombre o URL del documento
  titulo         text,                              -- título del documento
  seccion        text,                              -- encabezado de la sección
  categoria      text        not null default 'general'
                 check (categoria in ('producto', 'precio', 'politica', 'faq', 'empresa', 'general')),
  contenido      text        not null,
  metadata       jsonb       not null default '{}'::jsonb,
  hash           text        not null,              -- sha256 del contenido: evita re-embeber lo que no cambió
  embedding      extensions.vector(1536),                      -- OpenAI text-embedding-3-small
  fts            tsvector generated always as (
                   setweight(to_tsvector('kb.es_sin_acentos'::regconfig, coalesce(titulo, '') || ' ' || coalesce(seccion, '')), 'A') ||
                   setweight(to_tsvector('kb.es_sin_acentos'::regconfig, contenido), 'B')
                 ) stored,
  activo         boolean     not null default true,
  actualizado_en timestamptz not null default now(),
  unique (documento_id, orden)
);

create index if not exists fragmentos_embedding_idx
  on kb.fragmentos using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists fragmentos_fts_idx
  on kb.fragmentos using gin (fts);

create index if not exists fragmentos_categoria_idx
  on kb.fragmentos (categoria) where activo;

-- Solo la service key (n8n) accede: RLS activo, sin políticas públicas y sin
-- permisos para anon/authenticated sobre el esquema.
alter table kb.fragmentos enable row level security;

-- 4. Búsqueda híbrida --------------------------------------------------
-- Devuelve los mejores fragmentos combinando:
--   · ranking semántico (distancia coseno sobre embedding)
--   · ranking por palabras clave (websearch_to_tsquery en español)
-- y los fusiona con RRF: score = Σ peso / (rrf_k + posición).
create or replace function public.buscar_kb(
  query_text        text,
  query_embedding   extensions.vector(1536),
  match_count       int     default 5,
  filtro_categoria  text    default null,
  umbral_similitud  float   default 0.25,
  peso_texto        float   default 1.0,
  peso_semantico    float   default 1.0,
  rrf_k             int     default 50
)
returns table (
  id          bigint,
  fuente      text,
  titulo      text,
  seccion     text,
  categoria   text,
  contenido   text,
  similitud   float,
  score       float
)
language sql stable
set search_path = kb, extensions, public
as $$
  -- Cada CTE consulta la tabla directamente (sin CTE compartida) para que
  -- Postgres use el índice HNSW y el índice GIN.
  with semantica_bruta as (
    select k.id,
           1 - (k.embedding <=> query_embedding) as similitud,
           row_number() over (order by k.embedding <=> query_embedding) as rango
    from kb.fragmentos k
    where k.activo
      and (filtro_categoria is null or k.categoria = filtro_categoria)
    order by k.embedding <=> query_embedding
    limit least(match_count, 30) * 4
  ),
  semantica as (
    -- El umbral se aplica después del escaneo para no bloquear el índice.
    select * from semantica_bruta where similitud >= umbral_similitud
  ),
  consulta as (
    -- Palabras clave unidas con OR: una pregunta natural ("cuanto cuesta el FX-200")
    -- no exige que el fragmento tenga todas las palabras; ts_rank_cd premia
    -- a los que tienen más. Las frases ("FX-200") se conservan.
    select to_tsquery(
             'kb.es_sin_acentos'::regconfig,
             replace(websearch_to_tsquery('kb.es_sin_acentos'::regconfig, query_text)::text, ' & ', ' | ')
           ) as tsq
  ),
  texto as (
    select k.id,
           row_number() over (order by ts_rank_cd(k.fts, q.tsq) desc) as rango
    from kb.fragmentos k, consulta q
    where k.activo
      and (filtro_categoria is null or k.categoria = filtro_categoria)
      and k.fts @@ q.tsq
    order by rango
    limit least(match_count, 30) * 4
  )
  select k.id,
         k.fuente,
         k.titulo,
         k.seccion,
         k.categoria,
         k.contenido,
         s.similitud,
         coalesce(peso_semantico / (rrf_k + s.rango), 0.0) +
         coalesce(peso_texto     / (rrf_k + t.rango), 0.0) as score
  from semantica s
  full outer join texto t on t.id = s.id
  join kb.fragmentos k on k.id = coalesce(s.id, t.id)
  order by score desc
  limit least(match_count, 30);
$$;

-- 5. Utilidad para la ingesta -----------------------------------------
-- Desactiva los fragmentos sobrantes cuando un documento se acorta.
create or replace function public.kb_desactivar_sobrantes(
  p_documento_id text,
  p_total        int
)
returns int
language sql
set search_path = kb, extensions, public
as $$
  with afectados as (
    update kb.fragmentos
       set activo = false, actualizado_en = now()
     where documento_id = p_documento_id
       and orden >= p_total
       and activo
    returning 1
  )
  select count(*)::int from afectados;
$$;

-- Ingesta por RPC (n8n no ve el esquema `kb` por la API REST).
-- Hash actual de un fragmento: si coincide con el nuevo, no hay que volver a
-- pedir el embedding.
create or replace function public.kb_hash_actual(p_documento_id text, p_orden int)
returns text
language sql stable
set search_path = kb, extensions, public
as $$
  select hash from kb.fragmentos where documento_id = p_documento_id and orden = p_orden;
$$;

-- Crea o actualiza un fragmento. Devuelve 'creado', 'actualizado' o
-- 'sin_cambios' (mismo hash: solo se reactiva).
create or replace function public.kb_guardar_fragmento(
  p_documento_id text,
  p_orden        int,
  p_fuente       text,
  p_contenido    text,
  p_hash         text,
  p_embedding    extensions.vector(1536),
  p_titulo       text  default null,
  p_seccion      text  default null,
  p_categoria    text  default 'general',
  p_metadata     jsonb default '{}'::jsonb
)
returns text
language plpgsql
set search_path = kb, extensions, public
as $$
declare
  v_hash text;
begin
  select hash into v_hash from kb.fragmentos
   where documento_id = p_documento_id and orden = p_orden
   for update;

  if v_hash is null then
    insert into kb.fragmentos (documento_id, orden, fuente, titulo, seccion, categoria,
                               contenido, metadata, hash, embedding)
    values (p_documento_id, p_orden, p_fuente, p_titulo, p_seccion, p_categoria,
            p_contenido, p_metadata, p_hash, p_embedding);
    return 'creado';
  end if;

  if v_hash = p_hash then
    update kb.fragmentos set activo = true, actualizado_en = now()
     where documento_id = p_documento_id and orden = p_orden;
    return 'sin_cambios';
  end if;

  update kb.fragmentos
     set fuente = p_fuente, titulo = p_titulo, seccion = p_seccion, categoria = p_categoria,
         contenido = p_contenido, metadata = p_metadata, hash = p_hash,
         embedding = p_embedding, activo = true, actualizado_en = now()
   where documento_id = p_documento_id and orden = p_orden;
  return 'actualizado';
end;
$$;

-- 6. Permisos ------------------------------------------------------------
-- n8n entra con la llave de servicio (rol service_role). Nadie más.
grant usage on schema kb to service_role;
grant select, insert, update, delete on kb.fragmentos to service_role;
revoke all on function public.buscar_kb(text, extensions.vector, int, text, float, float, float, int) from public, anon, authenticated;
revoke all on function public.kb_desactivar_sobrantes(text, int) from public, anon, authenticated;
grant execute on function public.buscar_kb(text, extensions.vector, int, text, float, float, float, int) to service_role;
grant execute on function public.kb_desactivar_sobrantes(text, int) to service_role;
revoke all on function public.kb_hash_actual(text, int) from public, anon, authenticated;
revoke all on function public.kb_guardar_fragmento(text, int, text, text, text, extensions.vector, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.kb_hash_actual(text, int) to service_role;
grant execute on function public.kb_guardar_fragmento(text, int, text, text, text, extensions.vector, text, text, text, jsonb) to service_role;

-- 7. Prueba rápida (ejecutar tras cargar datos) -------------------------
-- select titulo, seccion, categoria, round(score::numeric, 4) as score, round(similitud::numeric, 3) as sim
-- from public.buscar_kb('¿cuánto vale el envío a Medellín?', '<embedding de la pregunta>'::vector, 5);
