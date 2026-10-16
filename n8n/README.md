# Workflow de n8n · Agente WhatsApp de Dicampo

`dicampo-agente-whatsapp.json` es el workflow para importar en n8n. **No se edita a mano**:
se genera con `python3 build.py` a partir de:

- `build.py`: nodos, conexiones y configuración.
- `system-prompt.md`: instrucciones de David (persona, flujo, reglas, herramientas, SKU).
- `js/`: el código de los nodos Code.

Si se cambia algo en n8n directamente, hay que llevar el cambio aquí o se pierde en la
siguiente generación.

## Qué hace

Tres entradas en un mismo workflow:

1. **`GET /webhook/dicampo-whatsapp`**: verificación del webhook de Meta (`hub.challenge`).
2. **`POST /webhook/dicampo-whatsapp`**: cada evento de Meta.
   - Valida `X-Hub-Signature-256` con el App Secret (HMAC del cuerpo crudo).
   - Separa mensajes y estados de entrega. Ignora otros `phone_number_id` y reacciones.
   - Audios, imágenes, stickers y PDF van a Supabase Storage con la firma del CRM.
     Si falla, el mensaje se registra igual, sin archivo.
   - Registra el entrante (idempotente: un reintento de Meta se ignora).
   - "CANCELAR", "DEJAR DE RECIBIR MENSAJES" y "ELIMINAR MIS DATOS" reciben su
     confirmación y no pasan por el agente.
   - Espera la ráfaga (7 s): si llegó otro mensaje del mismo número, responde esa otra
     ejecución, con todo el bloque.
   - Si la conversación está en manos de un asesor (HUMANO), no responde.
   - En el primer contacto envía el aviso de privacidad y registra el consentimiento AVISO.
   - El agente responde con un modelo de OpenAI (`gpt-4.1-mini` por defecto) y 9 herramientas
     del CRM.
   - Envía en orden (uno por uno), parte en varios mensajes con `---` y registra cada
     saliente con la traza (herramientas y fuentes) que muestra `/conversaciones`.
   - Si el modelo falla: mensaje de respaldo al cliente y escalamiento al asesor.
3. **`POST /webhook/dicampo-envio-asesor`**: lo llama el CRM cuando un asesor responde
   desde `/conversaciones`. Exige `X-CRM-Secret` y devuelve `{ waMessageId }`.

## Instalación

1. Importar `dicampo-agente-whatsapp.json` en n8n.
2. Crear o elegir las credenciales:

   | Credencial en el workflow | Tipo | Valor |
   |---|---|---|
   | CRM Dicampo · Agente IA | Header Auth | `Authorization` = `Bearer <AGENTE_API_KEY>` |
   | Meta WhatsApp · Token | Bearer Auth | Token permanente del System User de Meta |
   | OpenAI | OpenAI | API key (la misma sirve para los embeddings) |
   | CRM → n8n · X-CRM-Secret | Header Auth | `X-CRM-Secret` = `<N8N_ENVIO_SECRET>` |

3. Nodo **Config**: `phoneNumberId`, `metaAppSecret` y, cuando exista, `catalogoUrl`.
   **Config (asesor)**: el mismo `phoneNumberId`.
4. Nodo **¿Token de verificación correcto?**: cambiar `PEGAR_VERIFY_TOKEN` por el token
   que se ponga en Meta.
5. Activar (o publicar, en n8n 2.x).
6. En Meta: URL de callback `<n8n>/webhook/dicampo-whatsapp`, mismo token, campo `messages`.
7. En Netlify: `N8N_ENVIO_WEBHOOK_URL=<n8n>/webhook/dicampo-envio-asesor`,
   `N8N_ENVIO_SECRET` y `OPENAI_API_KEY` (búsqueda en la base de conocimiento).

## Pruebas

`pruebas/` tiene una prueba de punta a punta (35 comprobaciones) contra n8n real, el CRM
local y simuladores de Meta, Storage y OpenAI (`mocks.mjs`, puertos 4020, 4030 y 4040).
Pasa en n8n 1.123 y 2.43.

1. CRM local con `SUPABASE_URL=http://localhost:4030`, `SUPABASE_SERVICE_ROLE_KEY` cualquiera,
   `OPENAI_BASE_URL` a un simulador de embeddings, `N8N_ENVIO_WEBHOOK_URL` al n8n local y
   `N8N_ENVIO_SECRET=secreto-envio`.
2. Importar el workflow con Config apuntando a los simuladores
   (`crmUrl=http://localhost:3000`, `graphUrl=http://localhost:4020/v23.0`,
   `phoneNumberId=PNID`, `metaAppSecret=testsecret`, `esperaRafagaSeg=3`, token de
   verificación `vtoken`) y credenciales: OpenAI con URL base `http://localhost:4040/v1`, Meta con
   token `metatoken`, X-CRM-Secret `secreto-envio`.
3. Simulador de embeddings: `node n8n/pruebas/embeddings-mock.mjs serve` (puerto 4010, llave
   `sk-test`) y `DATABASE_URL=... node n8n/pruebas/sembrar-kb.mjs` para cargar 4 fragmentos
   (requiere el SQL de `supabase/kb/` aplicado en la base local).
4. `MOCK_LOG=/tmp/mocks.jsonl node n8n/pruebas/mocks.mjs` y luego
   `DATABASE_URL=... node n8n/pruebas/drive.mjs /tmp/mocks.jsonl`.

Usa los números `573000000901` a `904` y borra lo que crea.

## Notas

- **Modelo**: nodo *Modelo OpenAI* (Chat Completions, temperatura 0,4, 800 tokens, 30 s de
  espera). Para cambiarlo, editar `MODELO` en `build.py` y regenerar, o cambiarlo en el nodo.
  Los modelos de razonamiento no aceptan `temperature`: quitarla si se elige uno.

- Las herramientas usan el nodo "HTTP Request Tool" clásico
  (`@n8n/n8n-nodes-langchain.toolHttpRequest`). El nuevo (`httpRequestTool`) rompe los nodos
  Code en n8n 1.x (`Unrecognized node type`) por un error de n8n corregido en 2.x.
- El nodo HTTP Request envía los ítems en paralelo; por eso los mensajes salen por el
  bucle **Uno por uno**, para que lleguen en orden.
- Los SKU del prompt salen del catálogo del CRM. Si se crean sabores nuevos, actualizar
  la tabla de `system-prompt.md` y regenerar.
