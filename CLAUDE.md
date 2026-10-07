# CLAUDE.md

Guía para trabajar en este repositorio.

## Qué es

CRM operativo de **Dicampo** (https://dicampo.co/), fabricante de pulpa de fruta
congelada 100% natural que vende B2B en Bogotá a restaurantes, fruterías,
panaderías, comidas rápidas y cafeterías. Los pedidos entran por WhatsApp y
teléfono.

Cubre el ciclo completo: prospecto → cliente → pedido → despacho → entrega, con
inventario por lote (obligatorio: es producto congelado con fecha de
vencimiento).

Sustituye a `../dicampo-app-pedidos`, que usa Contentful como base de datos.

## Comandos

```bash
npm run dev          # servidor de desarrollo
npm run build        # prisma generate + next build
npm run typecheck    # tsc --noEmit
npm run lint
npm run test         # vitest run
npm run test:watch

npm run db:migrate   # crea y aplica una migración (desarrollo)
npm run db:deploy    # aplica migraciones pendientes (producción)
npm run db:seed      # datos maestros: sabores, zonas, precios, admin
npm run db:studio    # explorador de datos
npm run db:reset     # ⚠️ borra la base y vuelve a sembrar

npx tsx scripts/verificar-carga-masiva.ts   # carga masiva de punta a punta
npx tsx scripts/normalizar-whatsapp.ts      # llena Contact.whatsappE164 (--aplicar para escribir)
```

## Arquitectura

**Regla central: la lógica de negocio vive en `src/server/services/`.**

- Los **route handlers** (`src/app/api/**`) son una capa delgada: validan con
  Zod, llaman a un servicio y devuelven el resultado. No contienen reglas.
- Los **Server Components** leen llamando a **los mismos servicios**
  directamente, sin dar un salto HTTP innecesario.
- Las **mutaciones** desde el navegador pasan siempre por `/api`, usando
  `src/lib/api-client.ts`.

Así la lógica se escribe una vez y la API queda lista para integraciones
futuras (bot de WhatsApp, app del repartidor).

```
src/
├─ app/
│  ├─ (auth)/login/     pantalla pública
│  ├─ (crm)/            área privada (layout con navegación por rol)
│  └─ api/              API interna
├─ server/
│  ├─ db.ts             singleton de Prisma
│  ├─ auth.ts           Auth.js v5 (Node)
│  ├─ auth.config.ts    config compartida con el middleware (Edge)
│  ├─ guards.ts         requireUser / scopeToOwnPortfolio / requireAgent
│  ├─ agent-auth.ts     API key del agente IA (n8n)
│  ├─ errors.ts         errores de dominio, sin saber de HTTP
│  ├─ http.ts           ok() / route() / traducción de errores
│  ├─ import/           motor de carga masiva (lee archivo, ejecuta filas)
│  ├─ services/         ← la lógica de negocio
│  └─ validators/       esquemas Zod, compartidos con los formularios
├─ components/ui/       primitivos (tokens estilo shadcn, Tailwind v4)
├─ lib/                 lógica pura: totales, FEFO, formateo COP, NIT, WhatsApp
│  └─ import/           parseo de CSV, cotejo de columnas, catálogo de campos
└─ generated/prisma/    cliente generado (NO se versiona)
```

## Convenciones

- **Idioma**: enums y valores de negocio en **español** (coinciden con cómo se
  habla en la operación); nombres de modelos, campos y código en **inglés**.
  Toda la interfaz y los mensajes de error, en español.
- **Autorización**: *no* se usa RLS de Supabase. Prisma conecta con un rol
  privilegiado, así que **todo** handler y toda página privada debe empezar
  comprobando permisos. Un `VENDEDOR` solo ve su cartera
  (`scopeToOwnPortfolio`).
  - En **route handlers**: `requireUser(roles)` / `requireAdmin()`, que lanzan
    y se traducen a 401/403 con cuerpo JSON.
  - En **páginas**: `requireUserPage(roles)` / `requireAdminPage()`, que
    redirigen. Lanzar desde un Server Component sale con estado **500**: un
    rechazo de permisos quedaría contado como fallo del servidor.
  - Ojo: `requireUser([])` **no** restringe — una lista vacía significa
    "cualquier usuario con sesión". Para exigir ADMIN usa `requireAdmin()`.
- **Errores**: los servicios lanzan las clases de `server/errors.ts`; `route()`
  las traduce a códigos HTTP. Nunca devuelvas `NextResponse` de error a mano.
- **Etiquetas**: el texto de cualquier enum sale de `src/lib/labels.ts`. No
  escribas literales de estado en las pantallas.
- **Marca**: el logotipo está en `public/dicampo-logo.png` y se usa vía
  `components/layout/logo.tsx`; el favicon (`src/app/icon.png`) es la "D"
  recortada. Los colores exactos son verde `#5bb040` y naranja `#ec6928`,
  pero **el verde de marca solo da 2,7:1 sobre blanco**: se reserva para el
  logo. Los botones, enlaces y el anillo de foco usan `--primary` (#40822e,
  4,7:1) y el texto sobre fondos tenues usa `--primary-strong` (#2f6122).
  Al tocar la paleta, vuelve a comprobar los contrastes.
- **Dinero**: `Decimal(14,2)` en base, COP sin centavos en pantalla vía
  `formatCOP`. Prisma devuelve `Decimal`, no `number`: usa los formateadores.
- **Totales y FEFO**: la aritmética pura vive en `src/lib/order-math.ts` y
  `src/lib/fefo.ts`, fuera de los servicios, para poder probarla sin base de
  datos y para que el formulario muestre exactamente la misma cifra que
  persiste el servidor. El precio definitivo lo decide **siempre** el servidor.
- **Formularios**: `react-hook-form` + `zodResolver`, reutilizando el esquema de
  `server/validators/`. Usa los tres genéricos de `useForm<Form, unknown,
  Output>` porque `.default()` hace que entrada y salida difieran.
- **Histórico inmutable**: `OrderItem` guarda *snapshots* de nombre, SKU,
  presentación, precio **e IVA**. Cambiar el catálogo o subir la lista de
  precios no altera ningún pedido ya creado; los nuevos sí toman los valores
  actualizados. Está verificado end-to-end: no lo rompas al tocar pedidos.
- **Catálogo**: escritura solo para ADMIN — los precios son decisión comercial,
  no de operación. Productos y variantes **no se borran**, se desactivan
  (los pedidos históricos los referencian). El SKU se genera del sabor con
  `buildSku`; el IVA se elige de una lista cerrada (0/5/19 %) porque escribir
  "19" en vez de "0.19" multiplicaría el impuesto por cien.

## Detalles del stack que muerden

- **Prisma 7**: el bloque `datasource` **no** lleva `url` (va en
  `prisma.config.ts`); `output` es obligatorio en el generator; se importa desde
  `@/generated/prisma/client`; los **driver adapters son obligatorios**
  (`@prisma/adapter-pg`). Ya no hay motor Rust, así que **no** hacen falta
  `binaryTargets` para Netlify.
- **Dos URLs de Supabase**: `DATABASE_URL` es el pooler (puerto 6543,
  `pgbouncer=true`) y lo usa la app; `DIRECT_URL` es la conexión directa
  (puerto 5432) y solo la usa el CLI de Prisma. Las migraciones no funcionan
  sobre PgBouncer.
- **Auth.js v5**: el proveedor Credentials obliga a `session.strategy = "jwt"`.
  El middleware corre en Edge, por eso `auth.config.ts` no importa Prisma ni
  bcrypt.
- **La API está FUERA del middleware** (`matcher` excluye `/api`). Si se incluye,
  un endpoint sin sesión responde 307 hacia /login con HTML, y quien llama
  espera JSON. La protección la da `requireUser()` en cada handler, que
  produce un 401 con cuerpo JSON.
- **Consecutivos**: `Client.sequence` y `Order.orderNumber` son
  `@default(autoincrement())` de Postgres. Nunca los generes contando filas.
- **Fechas de un `<input type="date">`**: NO uses `z.coerce.date()`. Interpreta
  "AAAA-MM-DD" como medianoche UTC y al leerla con los metodos locales en
  Bogota (UTC-5) retrocede un dia: un rango personalizado dejaria fuera las
  ventas de su ultima jornada. Usa `localDateSchema` de
  `validators/reports.ts`, que construye la fecha en hora local.
- **Parametros repetidos en la URL** (?hojas=a&hojas=b, como los envia un grupo
  de casillas): `Object.fromEntries(searchParams)` **los colapsa y deja solo el
  ultimo**. Hay que leerlos con `searchParams.getAll(nombre)`.
- **Excel**: el libro se arma en `server/reports/workbook.ts` — encabezado con
  el verde de marca, fila congelada, autofiltro y formato de moneda COP. Las
  fechas y los montos se escriben como Date y number, **no como texto**, o no
  se pueden sumar ni ordenar en Excel. Los nombres de hoja se sanean: Excel no
  abre el archivo si pasan de 31 caracteres o llevan :  / ? * [ ].
- **CSV**: separador `;` y BOM al inicio, para que Excel en espanol lo abra
  bien; numeros con coma decimal, o Excel los lee como texto. Las celdas que
  empiezan por `= + - @` se neutralizan con un apostrofe (inyeccion de
  formulas). Ojo al probar: `Response.text()` **elimina el BOM** al decodificar;
  hay que mirar los bytes con `arrayBuffer()`.
- **Rutas**: el estado de la ruta arrastra el de sus pedidos, porque describen
  el mismo hecho. Salir a ruta los pasa a DESPACHADO; cada entrega se registra
  por pedido con su evidencia y lo pasa a ENTREGADO; la ruta se cierra sola al
  caer la ultima pendiente. **Cancelar una ruta NO cancela sus pedidos**: los
  devuelve a EN_PREPARACION y los libera, conservando el inventario ya
  reservado, para poder reprogramarlos.
- Solo se montan en ruta pedidos que ya descontaron inventario (CONFIRMADO o
  EN_PREPARACION): despachar sin stock reservado seria prometer mercancia que
  no existe.
- **Contactos y sedes**: se dan de baja, no se borran — las actividades
  referencian contactos y los pedidos referencian sedes (la remisión de una
  entrega pasada necesita su dirección). "Principal" es excluyente y se
  reasigna solo al dar de baja al que lo era. Un cliente **no puede quedarse
  sin sede activa**: sin ella no se le puede despachar.
- **Usuarios**: no se borran, se desactivan (sus pedidos y clientes necesitan
  autor). Tres salvaguardas en `services/users.ts` impiden quedarse sin
  acceso: nadie se desactiva a sí mismo, nadie se quita su propio rol de ADMIN,
  y siempre debe quedar un ADMIN activo. El hash nunca sale del servicio.
- **Agente IA de WhatsApp**: existe como el usuario `agente-ia@dicampo.co` con
  rol `AGENTE_IA` (constantes en `lib/agent.ts`), porque la bitácora y las
  conversaciones necesitan autor. No tiene contraseña ni puede recibirla, no
  cambia de rol y el rol no se ofrece en los formularios: entra solo por
  `/api/agente` con API key. **Desactivarlo apaga la integración**, por eso la
  semilla nunca toca su `active`.
- **API del agente** (`/api/agente/*`): cada handler empieza con
  `requireAgent(request)`, que valida `Authorization: Bearer` contra
  `AGENTE_API_KEY` (o `AGENTE_API_KEY_ANTERIOR` mientras se rota) comparando
  SHA-256 en tiempo constante, y devuelve el usuario `AGENTE_IA` como un
  `SessionUser` para reutilizar los servicios. Llave mala o sin configurar →
  401; agente desactivado → 403. `GET /api/agente/estado` sirve para probar
  la conexión desde n8n. Rotar: llave vieja a `_ANTERIOR`, nueva a
  `AGENTE_API_KEY`, actualizar n8n, vaciar `_ANTERIOR`.
- **Trabajo comercial del agente** (`services/agent.ts`, reglas puras en
  `lib/agent-rules.ts`). Contratos en español porque son las herramientas
  que ve el modelo en n8n:
  - `GET leads?telefono=` → ficha resumida o `null`. Si el número está en
    varios clientes, gana el de actividad más reciente.
  - `POST leads` crea cliente `PROSPECTO` + contacto y lo vincula a la
    conversación. **Idempotente por teléfono** (201 creado / 200 existente),
    con candado `pg_advisory_xact_lock` para los reintentos en paralelo.
    Vendedor por rotación (`pickSeller`: menos prospectos; en empate, el que
    lleva más sin recibir). Sin vendedores activos queda sin asignar y se
    crea una tarea al ADMIN.
  - `PATCH leads/:clientId` completa datos y sede; nunca toca estado,
    vendedor ni NIT.
  - `POST oportunidades` recibe `interes: [{ sku, kilosMes }]` — **el
    interés completo vigente, no un incremento** — y el CRM lo valora con
    `buildPriceResolver()` (kilos → unidades de la variante). Una sola
    oportunidad abierta por cliente: crea en CONTACTADO o revalora (201/200).
    Las notas terminan en un bloque "Interés declarado por WhatsApp" que se
    reemplaza; lo que escriba el vendedor arriba se conserva.
  - `POST oportunidades/:id/etapa` solo a CONTACTADO, MUESTRA_ENVIADA o
    NEGOCIACION y nunca sobre una cerrada. El agente no gana ni pierde.
  - `POST actividades`: resumen tipo WHATSAPP a nombre del agente.
  - `POST visitas` (fecha ISO **con zona**): VISITA pendiente en la agenda
    del vendedor, sede principal, oportunidad a CONTACTADO si seguía en
    PROSPECTO (no retrocede) y conversación a HUMANO.
  - `POST escalar`: conversación a HUMANO asignada al vendedor y tarea para
    ya. Si ya estaba en HUMANO solo actualiza el resumen, sin duplicar tarea.
  - **Agenda**: lo que hace el agente va a su nombre; lo que le toca a una
    persona (visita, escalamiento) va a nombre del vendedor, porque la agenda
    de cada uno son sus actividades pendientes. Sin vendedor activo, al
    primer ADMIN activo.
- **WhatsApp por contacto**: `Contact.whatsappE164` es el número normalizado
  con `contactWhatsappKey()` (WhatsApp o, si falta, teléfono). Lo mantiene
  `services/clients.ts` al crear y editar; es la llave con que el agente
  encuentra al cliente, así que nada debe escribir `whatsapp` o `phone` sin
  pasar por el servicio.
- **Conversaciones** (`WhatsappConversation`, `WhatsappMessage`): un número =
  una conversación. `waMessageId` es único para absorber los reintentos del
  webhook de Meta. Un lead descartado (fuera de cobertura o sin negocio) queda
  solo como conversación, sin crear cliente. Los seguimientos exigen
  `marketingConsentAt` y respetan `optOutAt`: es lo que pide la política de
  datos de Dicampo.
- **Pipeline**: a diferencia de los pedidos, NO es una máquina de estados
  rígida — en ventas se retrocede de etapa con normalidad. Las únicas reglas
  están en `src/lib/pipeline-stages.ts`: perder exige motivo, cerrar estampa
  `closedAt`, reabrir lo limpia, y ganar activa al cliente si era PROSPECTO.
- **Ajustes de inventario**: la interfaz pide la cantidad **en positivo** y el
  signo lo pone el tipo de operación — en bodega se piensa "se dañaron 5", no
  "menos cinco". Solo se ofrecen AJUSTE y MERMA: las salidas por venta y las
  devoluciones las genera el flujo de pedidos, y tecleadas a mano
  descuadrarían el kardex contra los pedidos.
- **Lotes vencidos**: `expireOverdueLots` los pasa a VENCIDO y así salen de la
  rotación FEFO (`lockAvailableLots` filtra por DISPONIBLE). Hoy se dispara a
  mano desde bodega; debería ser una tarea diaria.
- **Inventario FEFO**: al confirmar un pedido se asignan lotes por
  `expiryDate` ascendente, **dentro de una transacción** que descuenta
  `Lot.quantityAvailable` y escribe el `StockMovement`. `Order.stockAppliedAt`
  hace la operación idempotente.

## Carga masiva

Siete entidades se pueden subir por archivo desde `/importar` (y desde el botón
"Importar" de cada módulo): clientes, contactos, sedes, productos, precios,
lotes y oportunidades. Pedidos no: una fila por renglón con FEFO y precios es
otro problema.

- **No depende de una plantilla.** El archivo se lee, se proponen las columnas
  y la persona corrige el cotejo. La sugerencia sale de los **alias** de cada
  campo en `lib/import/entities.ts`; si un encabezado real no se reconoce, el
  arreglo es añadirlo ahí, no pedirle a nadie que renombre su Excel.
- **La simulación y la ejecución real recorren el mismo código**; solo cambia
  `dryRun`. Una vista previa calculada aparte acabaría prometiendo algo
  distinto de lo que luego ocurre.
- **Una fila mala no tumba el archivo**: cada fila se procesa y se reporta
  aparte. Nada de envolverlo todo en una transacción — obligaría a corregir dos
  mil filas por una celda con una fecha rara.
- **Los importadores llaman a los servicios**, nunca a Prisma para escribir.
  Así la carga respeta las mismas reglas que el formulario (cartera del
  vendedor, NIT único, sede principal excluyente, kardex del lote). El precio
  de eso son varias consultas por fila; a 2.000 filas como máximo, sale a
  cuenta.
- **Permisos por módulo**: cada carga exige los roles de su módulo. Catálogo y
  precios, solo ADMIN; lotes, bodega; cartera y pipeline, ventas. `ImportLink`
  comprueba el mismo permiso que la pantalla, así que no aparece un botón que
  acabe en una redirección.
- **.xls no se lee** (ExcelJS solo abre .xlsx) y se dice con todas las letras
  al detectar la firma OLE2, en vez de fallar con "archivo dañado". Sí se leen
  .xlsx, .csv, .tsv y .txt.
- **Codificación**: se intenta UTF-8 y, si aparecen caracteres de reemplazo, se
  reintenta con Windows-1252 — los CSV de sistemas viejos vienen en ANSI.
- El tope de 2.000 filas (`validators/imports.ts`) no es del negocio: el
  archivo viaja al navegador para cotejar y vuelve para ejecutarse.
- Los lotes **solo se crean**. Un lote existente no se reescribe: su saldo es
  el resultado del kardex, y cambiarlo por archivo descuadraría la auditoría.

## Estado actual

Verificado contra la base real de Supabase (PostgreSQL 17.6), además de
`typecheck`, `lint`, `build` y 95 pruebas unitarias:

- Migración inicial aplicada y semilla cargada (17 sabores, 23 variantes con
  precio, 6 zonas de Bogotá, usuario admin).
- Flujo end-to-end comprobado: alta de cliente con contacto y sede → registro
  de lotes → pedido → confirmación con reparto **FEFO** → cancelación con
  devolución de inventario. Incluye los casos que deben fallar: transición
  inválida y stock insuficiente (con reversión completa de la transacción).
- Pipeline verificado end-to-end: avance por el embudo, cierre con motivo,
  reapertura que limpia el cierre, activación automática del cliente al ganar
  y aislamiento por vendedor.
- Login por credenciales, propagación del rol en la sesión y todas las
  pantallas respondiendo 200 con sesión iniciada.

### Módulos

| Módulo | Estado |
|---|---|
| Infraestructura, auth, roles | Listo |
| Clientes | Listo |
| Catálogo y precios (editable) | Listo |
| Pedidos | Listo |
| Inventario FEFO (editable) | Listo |
| Pipeline y actividades | Listo |
| Usuarios y perfil | Listo |
| Rutas de despacho | Listo |
| Reportes | Listo |
| Carga masiva (CSV / XLSX) | Listo |
| Migración desde Contentful | Pendiente |

Todos los módulos listos tienen interfaz completa de lectura y escritura.

De la carga masiva están verificados el lector y el cotejo (CSV con separador
detectado, comillas y BOM; XLSX con hoja de portada, título suelto, números y
fechas; rechazo del .xls binario; y cotejo correcto de las siete entidades
sobre encabezados verosímiles).

La ejecución también está verificada. `scripts/verificar-carga-masiva.ts` sube
un CSV por cada una de las siete entidades contra la base de `DATABASE_URL`,
con el cotejo que propone el propio módulo: simula, ejecuta, comprueba lo que
quedó en la base y borra lo que creó (todo lleva la marca `ZZVERIF`). Pasa
completo contra Postgres local. En producción se simularon las siete y se
escribieron de verdad productos y precios: así entraron los precios del
brochure 2026 y los sabores Uva, Piña y Piña Colada.

**Sobre archivos adjuntos:** se descartó Cloudflare R2. Las imágenes de
producto no aportan en un CRM interno —el vendedor conoce el catálogo— y la
foto de la remisión firmada no justifica otro servicio: la evidencia actual
(quién recibió y su documento) ya es defendible ante un reclamo. Si se añade,
será con **Supabase Storage**, que ya está aprovisionado y cuyo plan gratuito
sobra para el volumen real. Los campos `Product.imageKey` y
`DeliveryProof.photoKey` quedan reservados en el esquema, sin uso.
