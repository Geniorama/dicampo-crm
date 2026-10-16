"""Genera el workflow de n8n "Dicampo · Agente WhatsApp" (JSON para importar)."""
import json
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).parent
NS = uuid.UUID("6f1c3a52-9d1e-4b8f-a0a1-d1ca3a0d0001")


def uid(name: str) -> str:
    return str(uuid.uuid5(NS, name))


CRM_CRED = {"httpHeaderAuth": {"id": "REEMPLAZAR", "name": "CRM Dicampo · Agente IA"}}
META_CRED = {"httpBearerAuth": {"id": "REEMPLAZAR", "name": "Meta WhatsApp · Token"}}
OPENAI_CRED = {"openAiApi": {"id": "REEMPLAZAR", "name": "OpenAI"}}
MODELO = "gpt-4.1-mini"
CRM_SECRET_CRED = {"httpHeaderAuth": {"id": "REEMPLAZAR", "name": "CRM → n8n · X-CRM-Secret"}}

CFG = "$('Config').first().json"
CRM = "{{ " + CFG + ".crmUrl }}/api/agente"
GRAPH = "{{ " + CFG + ".graphUrl }}"

nodes: list[dict] = []
connections: dict = {}


def node(name, type_, version, params, pos, **extra):
    n = {
        "parameters": params,
        "id": uid(name),
        "name": name,
        "type": type_,
        "typeVersion": version,
        "position": list(pos),
    }
    n.update(extra)
    nodes.append(n)
    return name


def connect(src, dst, out=0, kind="main", inp=0):
    conns = connections.setdefault(src, {}).setdefault(kind, [])
    while len(conns) <= out:
        conns.append([])
    conns[out].append({"node": dst, "type": kind, "index": inp})


def code(name, js_file, pos, each=False, **extra):
    params = {"jsCode": (HERE / "js" / js_file).read_text()}
    if each:
        params["mode"] = "runOnceForEachItem"
    return node(name, "n8n-nodes-base.code", 2, params, pos, **extra)


def http(name, pos, method, url, body=None, cred=None, headers=None, options=None, **extra):
    params = {"method": method, "url": url}
    if cred is CRM_CRED or cred is CRM_SECRET_CRED:
        params.update({"authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth"})
    elif cred is META_CRED:
        params.update({"authentication": "genericCredentialType", "genericAuthType": "httpBearerAuth"})
    if headers:
        params["sendHeaders"] = True
        params["headerParameters"] = {"parameters": [{"name": k, "value": v} for k, v in headers.items()]}
    if body is not None:
        params.update({"sendBody": True, "specifyBody": "json", "jsonBody": body})
    params["options"] = options or {}
    if method == "GET":
        params.pop("method")
    extra_cred = {"credentials": cred} if cred else {}
    return node(name, "n8n-nodes-base.httpRequest", 4.3, params, pos, **extra_cred, **extra)


def cond_string(left, right, op="equals"):
    return {
        "id": uid(f"cond-{left}-{right}-{op}"),
        "leftValue": left,
        "rightValue": right,
        "operator": {"type": "string", "operation": op},
    }


def if_node(name, pos, conditions, combinator="and"):
    for c in conditions:
        if c["operator"]["operation"] in ("empty", "notEmpty", "true", "false", "exists", "notExists"):
            c["operator"]["singleValue"] = True
    return node(
        name,
        "n8n-nodes-base.if",
        2.2,
        {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                "conditions": conditions,
                "combinator": combinator,
            },
            "looseTypeValidation": True,
            "options": {},
        },
        pos,
    )


def sticky(name, content, pos, w, h, color=None):
    params = {"content": content, "height": h, "width": w}
    if color:
        params["color"] = color
    node(name, "n8n-nodes-base.stickyNote", 1, params, pos)


RETRY = {"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 2000}

# ── Config ──────────────────────────────────────────────────────────────
CONFIG_FIELDS = [
    ("crmUrl", "https://crm.dicampo.co"),
    ("graphUrl", "https://graph.facebook.com/v23.0"),
    ("phoneNumberId", "PEGAR_PHONE_NUMBER_ID"),
    ("metaAppSecret", "PEGAR_APP_SECRET"),
    ("politicaUrl", "https://dicampo.co/politica-de-privacidad"),
    ("politicaVersion", "2026-01"),
    ("catalogoUrl", ""),
    ("esperaRafagaSeg", "7"),
]

# ── 1. Verificación del webhook (GET) ───────────────────────────────────
node(
    "Meta · Verificación (GET)",
    "n8n-nodes-base.webhook",
    2.1,
    {"path": "dicampo-whatsapp", "responseMode": "responseNode", "options": {}},
    (-1400, -560),
    webhookId=uid("wh-get"),
)
if_node(
    "¿Token de verificación correcto?",
    (-1180, -560),
    [
        cond_string("={{ $json.query['hub.mode'] }}", "subscribe"),
        cond_string("={{ $json.query['hub.verify_token'] }}", "PEGAR_VERIFY_TOKEN"),
    ],
)
node(
    "Responder challenge",
    "n8n-nodes-base.respondToWebhook",
    1.4,
    {"respondWith": "text", "responseBody": "={{ $json.query['hub.challenge'] }}", "options": {"responseCode": 200}},
    (-940, -640),
)
node(
    "Rechazar verificación",
    "n8n-nodes-base.respondToWebhook",
    1.4,
    {"respondWith": "noData", "options": {"responseCode": 403}},
    (-940, -480),
)
connect("Meta · Verificación (GET)", "¿Token de verificación correcto?")
connect("¿Token de verificación correcto?", "Responder challenge", 0)
connect("¿Token de verificación correcto?", "Rechazar verificación", 1)

# ── 2. Mensajes entrantes (POST) ───────────────────────────────────────
node(
    "Meta · Webhook (POST)",
    "n8n-nodes-base.webhook",
    2.1,
    {"httpMethod": "POST", "path": "dicampo-whatsapp", "options": {"rawBody": True}},
    (-1400, 0),
    webhookId=uid("wh-post"),
)
node(
    "Config",
    "n8n-nodes-base.set",
    3.4,
    {
        "assignments": {
            "assignments": [
                {"id": uid("cfg-" + k), "name": k, "value": v, "type": "string"} for k, v in CONFIG_FIELDS
            ]
        },
        "includeOtherFields": True,
        "options": {},
    },
    (-1180, 0),
)
node(
    "Firma calculada",
    "n8n-nodes-base.crypto",
    1,
    {
        "action": "hmac",
        "type": "SHA256",
        "binaryData": True,
        "binaryPropertyName": "data",
        "dataPropertyName": "firmaCalculada",
        "secret": "={{ $json.metaAppSecret }}",
        "encoding": "hex",
    },
    (-960, 0),
)
if_node(
    "¿Firma válida?",
    (-740, 0),
    [cond_string("={{ $json.headers['x-hub-signature-256'] }}", "={{ 'sha256=' + $json.firmaCalculada }}")],
)
node("Firma inválida: descartar", "n8n-nodes-base.noOp", 1, {}, (-520, 140))
code("Desglosar evento", "desglosar.js", (-520, -20))
node(
    "¿Mensaje o estado?",
    "n8n-nodes-base.switch",
    3.2,
    {
        "rules": {
            "values": [
                {
                    "conditions": {
                        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                        "conditions": [cond_string("={{ $json.evento }}", "mensaje")],
                        "combinator": "and",
                    },
                    "renameOutput": True,
                    "outputKey": "Mensaje",
                },
                {
                    "conditions": {
                        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                        "conditions": [cond_string("={{ $json.evento }}", "estado")],
                        "combinator": "and",
                    },
                    "renameOutput": True,
                    "outputKey": "Estado",
                },
            ]
        },
        "options": {},
    },
    (-300, -20),
)
connect("Meta · Webhook (POST)", "Config")
connect("Config", "Firma calculada")
connect("Firma calculada", "¿Firma válida?")
connect("¿Firma válida?", "Desglosar evento", 0)
connect("¿Firma válida?", "Firma inválida: descartar", 1)
connect("Desglosar evento", "¿Mensaje o estado?")

# Estados de entrega
http(
    "CRM · Estado de entrega",
    (-60, 240),
    "POST",
    "=" + CRM + "/conversaciones/entregas",
    "={{ JSON.stringify({ waMessageId: $json.waMessageId, estado: $json.estado }) }}",
    CRM_CRED,
    onError="continueRegularOutput",
)
connect("¿Mensaje o estado?", "CRM · Estado de entrega", 1)

# Multimedia
if_node("¿Trae archivo?", (-60, -20), [cond_string("={{ $json.mediaId }}", "", "notEmpty")])
http(
    "Meta · Datos del archivo",
    (180, -180),
    "GET",
    "=" + GRAPH + "/{{ $json.mediaId }}",
    cred=META_CRED,
    onError="continueErrorOutput",
    **RETRY,
)
http(
    "CRM · Firmar subida",
    (400, -180),
    "POST",
    "=" + CRM + "/conversaciones/media",
    "={{ JSON.stringify({ telefono: $('Desglosar evento').item.json.telefono, mime: $json.mime_type, "
    "bytes: $json.file_size, waMessageId: $('Desglosar evento').item.json.waMessageId }) }}",
    CRM_CRED,
    onError="continueErrorOutput",
)
http(
    "Meta · Descargar archivo",
    (620, -180),
    "GET",
    "={{ $('Meta · Datos del archivo').item.json.url }}",
    cred=META_CRED,
    options={"response": {"response": {"responseFormat": "file"}}},
    onError="continueErrorOutput",
    **RETRY,
)
node(
    "Storage · Subir archivo",
    "n8n-nodes-base.httpRequest",
    4.3,
    {
        "method": "PUT",
        "url": "={{ $('CRM · Firmar subida').item.json.data.urlSubida }}",
        "sendHeaders": True,
        "headerParameters": {
            "parameters": [
                {"name": "Content-Type", "value": "={{ $('Meta · Datos del archivo').item.json.mime_type }}"},
                {"name": "x-upsert", "value": "true"},
            ]
        },
        "sendBody": True,
        "contentType": "binaryData",
        "inputDataFieldName": "data",
        "options": {},
    },
    (840, -180),
    onError="continueErrorOutput",
    **RETRY,
)
node(
    "Archivo guardado",
    "n8n-nodes-base.set",
    3.4,
    {
        "assignments": {
            "assignments": [
                {"id": uid("ok-archivo"), "name": "archivoOk", "value": True, "type": "boolean"},
                {
                    "id": uid("ok-ruta"),
                    "name": "ruta",
                    "value": "={{ $('CRM · Firmar subida').item.json.data.ruta }}",
                    "type": "string",
                },
                {
                    "id": uid("ok-bytes"),
                    "name": "bytes",
                    "value": "={{ $('Meta · Datos del archivo').item.json.file_size }}",
                    "type": "number",
                },
            ]
        },
        "options": {"stripBinary": True},
    },
    (1060, -240),
)
node(
    "Archivo no disponible",
    "n8n-nodes-base.set",
    3.4,
    {
        "assignments": {
            "assignments": [{"id": uid("ko-archivo"), "name": "archivoOk", "value": False, "type": "boolean"}]
        },
        "options": {"stripBinary": True},
    },
    (1060, -100),
)
connect("¿Mensaje o estado?", "¿Trae archivo?", 0)
connect("¿Trae archivo?", "Meta · Datos del archivo", 0)
connect("Meta · Datos del archivo", "CRM · Firmar subida", 0)
connect("Meta · Datos del archivo", "Archivo no disponible", 1)
connect("CRM · Firmar subida", "Meta · Descargar archivo", 0)
connect("CRM · Firmar subida", "Archivo no disponible", 1)
connect("Meta · Descargar archivo", "Storage · Subir archivo", 0)
connect("Meta · Descargar archivo", "Archivo no disponible", 1)
connect("Storage · Subir archivo", "Archivo guardado", 0)
connect("Storage · Subir archivo", "Archivo no disponible", 1)

# Registrar entrante
code("Preparar entrante", "preparar-entrante.js", (1280, -20), each=True)
http(
    "CRM · Registrar entrante",
    (1500, -20),
    "POST",
    "=" + CRM + "/conversaciones/mensajes",
    "={{ JSON.stringify($json.cuerpo) }}",
    CRM_CRED,
    **RETRY,
)
if_node(
    "¿Mensaje nuevo?",
    (1720, -20),
    [{
        "id": uid("nuevo"),
        "leftValue": "={{ $json.data.creado }}",
        "rightValue": "",
        "operator": {"type": "boolean", "operation": "true"},
    }],
)
node("Reintento de Meta: ignorar", "n8n-nodes-base.noOp", 1, {}, (1940, 140))
connect("¿Trae archivo?", "Preparar entrante", 1)
connect("Archivo guardado", "Preparar entrante")
connect("Archivo no disponible", "Preparar entrante")
connect("Preparar entrante", "CRM · Registrar entrante")
connect("CRM · Registrar entrante", "¿Mensaje nuevo?")
connect("¿Mensaje nuevo?", "Reintento de Meta: ignorar", 1)

node(
    "¿Palabra clave?",
    "n8n-nodes-base.switch",
    3.2,
    {
        "rules": {
            "values": [
                {
                    "conditions": {
                        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                        "conditions": [cond_string("={{ $json.data.palabraClave }}", "", "notEmpty") | {"operator": {"type": "string", "operation": "notEmpty", "singleValue": True}}],
                        "combinator": "and",
                    },
                    "renameOutput": True,
                    "outputKey": "Baja o supresión",
                }
            ]
        },
        "options": {"fallbackOutput": "extra", "renameFallbackOutput": "Conversación normal"},
    },
    (1940, -40),
)
connect("¿Mensaje nuevo?", "¿Palabra clave?", 0)
code("Confirmar palabra clave", "palabra-clave.js", (2160, -220), each=True)
connect("¿Palabra clave?", "Confirmar palabra clave", 0)

# Buffer de ráfaga y contexto
node(
    "Esperar ráfaga",
    "n8n-nodes-base.wait",
    1.1,
    {"amount": "={{ Number(" + CFG + ".esperaRafagaSeg) || 7 }}"},
    (2160, -20),
    webhookId=uid("wait"),
)
http(
    "CRM · Contexto",
    (2380, -20),
    "GET",
    "=" + CRM + "/conversaciones/contexto?telefono={{ $('Preparar entrante').item.json.telefono }}&limite=20",
    cred=CRM_CRED,
    **RETRY,
)
if_node(
    "¿Es el último mensaje?",
    (2600, -20),
    [cond_string(
        "={{ $json.data.estado.ultimoEntrante.waMessageId }}",
        "={{ $('Preparar entrante').item.json.waMessageId }}",
    )],
)
node("Otro mensaje más nuevo responde", "n8n-nodes-base.noOp", 1, {}, (2820, 140))
if_node("¿Responde el bot?", (2820, -20), [cond_string("={{ $json.data.estado.estado }}", "BOT")])
node("Lo atiende un asesor", "n8n-nodes-base.noOp", 1, {}, (3040, 140))
if_node(
    "¿Falta el aviso de privacidad?",
    (3040, -20),
    [cond_string("={{ $json.data.estado.consentimiento.aviso }}", "", "empty")],
)
connect("¿Palabra clave?", "Esperar ráfaga", 1)
connect("Esperar ráfaga", "CRM · Contexto")
connect("CRM · Contexto", "¿Es el último mensaje?")
connect("¿Es el último mensaje?", "¿Responde el bot?", 0)
connect("¿Es el último mensaje?", "Otro mensaje más nuevo responde", 1)
connect("¿Responde el bot?", "¿Falta el aviso de privacidad?", 0)
connect("¿Responde el bot?", "Lo atiende un asesor", 1)

# Aviso de privacidad (primer contacto)
node(
    "Texto del aviso",
    "n8n-nodes-base.set",
    3.4,
    {
        "assignments": {
            "assignments": [
                {"id": uid("av-tel"), "name": "telefono", "value": "={{ $('Preparar entrante').item.json.telefono }}", "type": "string"},
                {
                    "id": uid("av-txt"),
                    "name": "texto",
                    "value": "=Antes de seguir, te cuento que tratamos tus datos según nuestra política de privacidad: "
                    "{{ " + CFG + ".politicaUrl }}. Si en algún momento no quieres recibir más mensajes, escribe "
                    "DEJAR DE RECIBIR MENSAJES.",
                    "type": "string",
                },
            ]
        },
        "options": {},
    },
    (3260, -200),
)
http(
    "Meta · Enviar aviso",
    (3480, -200),
    "POST",
    "=" + GRAPH + "/{{ " + CFG + ".phoneNumberId }}/messages",
    "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $json.telefono, type: 'text', "
    "text: { preview_url: false, body: $json.texto } }) }}",
    META_CRED,
    **RETRY,
)
http(
    "CRM · Registrar aviso",
    (3700, -200),
    "POST",
    "=" + CRM + "/conversaciones/mensajes",
    "={{ JSON.stringify({ telefono: $('Texto del aviso').item.json.telefono, waMessageId: $json.messages[0].id, "
    "direccion: 'SALIENTE', texto: $('Texto del aviso').item.json.texto }) }}",
    CRM_CRED,
    **RETRY,
)
http(
    "CRM · Consentimiento AVISO",
    (3920, -200),
    "POST",
    "=" + CRM + "/conversaciones/consentimiento",
    "={{ JSON.stringify({ telefono: $('Texto del aviso').item.json.telefono, tipo: 'AVISO', "
    "versionPolitica: " + CFG + ".politicaVersion }) }}",
    CRM_CRED,
    **RETRY,
)
connect("¿Falta el aviso de privacidad?", "Texto del aviso", 0)
connect("Texto del aviso", "Meta · Enviar aviso")
connect("Meta · Enviar aviso", "CRM · Registrar aviso")
connect("CRM · Registrar aviso", "CRM · Consentimiento AVISO")

# Agente
code("Armar prompt", "armar-prompt.js", (4140, -20), each=True)
connect("¿Falta el aviso de privacidad?", "Armar prompt", 1)
connect("CRM · Consentimiento AVISO", "Armar prompt")

system = (HERE / "system-prompt.md").read_text()
catalog_expr = (
    "{{ " + CFG + ".catalogoUrl ? '- Catálogo con sabores y precios: ' + " + CFG + ".catalogoUrl + "
    "' (compártelo cuando pregunten por precios).' : '- Aún no hay enlace al catálogo: si preguntan precios, da el "
    "ancla por jugo y ofrece que el asesor lo comparte en la visita.' }}"
)
system = "=" + system.replace("{{CATALOGO}}", catalog_expr)

node(
    "David · Agente IA",
    "@n8n/n8n-nodes-langchain.agent",
    2.2,
    {
        "promptType": "define",
        "text": "={{ $json.prompt }}",
        "options": {"systemMessage": system, "maxIterations": 8, "returnIntermediateSteps": True},
    },
    (4140, -20),
    onError="continueErrorOutput",
)
# Chat Completions (v1.2): misma configuración en n8n 1.x y 2.x. Si se elige un
# modelo de razonamiento que no acepta temperature, quitarla de las opciones.
node(
    "Modelo OpenAI",
    "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    1.2,
    {
        "model": {"__rl": True, "mode": "id", "value": MODELO},
        "options": {"maxTokens": 800, "temperature": 0.4, "timeout": 30000, "maxRetries": 2},
    },
    (3900, 260),
    credentials=OPENAI_CRED,
)
connect("Armar prompt", "David · Agente IA")
connect("Modelo OpenAI", "David · Agente IA", kind="ai_languageModel")

PHONE = "{{ $('Armar prompt').first().json.telefono }}"


def tool(name, pos, description, method, url, body, placeholders):
    params = {
        "toolDescription": description,
        "method": method,
        "url": url,
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": body,
        "placeholderDefinitions": {
            "values": [{"name": n, "description": d, "type": t} for n, d, t in placeholders]
        },
    }
    node(name, "@n8n/n8n-nodes-langchain.toolHttpRequest", 1.1, params, pos, credentials=CRM_CRED)
    connect(name, "David · Agente IA", kind="ai_tool")


tool(
    "buscar_conocimiento",
    (4020, 420),
    "Busca en la base de conocimiento de Dicampo: productos, condiciones comerciales, políticas, "
    "preguntas frecuentes y manejo de objeciones. Úsala antes de afirmar algo que no esté en tus datos fijos.",
    "POST",
    "=" + CRM + "/conocimiento/buscar",
    '{ "consulta": {consulta}, "limite": 4 }',
    [("consulta", "La pregunta o tema a buscar, en español", "string")],
)
tool(
    "registrar_lead",
    (4160, 420),
    "Registra al prospecto en el CRM cuando califica (negocio de alimentos dentro de la cobertura). "
    "Devuelve la ficha con data.cliente.id, que es el clientId. No la uses si la ficha ya trae un cliente.",
    "POST",
    "=" + CRM + "/leads",
    '={ "telefono": "' + PHONE + '", "nombreContacto": {nombreContacto}, "negocio": {negocio}, "tipo": {tipo} }',
    [
        ("nombreContacto", "Nombre de la persona", "string"),
        ("negocio", "Nombre del negocio; texto vacío si no lo dijo", "string"),
        ("tipo", "Uno de RESTAURANTE, FRUTERIA, PANADERIA, COMIDAS_RAPIDAS, CAFETERIA, HOTEL u OTRO", "string"),
    ],
)
tool(
    "actualizar_lead",
    (4300, 420),
    "Completa datos del cliente en el CRM. Envía solo los campos nuevos que el cliente acaba de dar.",
    "PATCH",
    "=" + CRM + "/leads/{clientId}",
    "{campos}",
    [
        ("clientId", "clientId de la ficha o de registrar_lead", "string"),
        ("campos", "Objeto con los campos nuevos. Claves posibles: razonSocial, nombreComercial, tipo, correo, "
         "nombreContacto, cargoContacto y sede ({direccion, barrio, ciudad, indicaciones})", "json"),
    ],
)
tool(
    "registrar_interes",
    (4440, 420),
    "Registra o actualiza la oportunidad con los sabores y kilos al mes que le interesan. Manda siempre la "
    "lista completa vigente. El CRM calcula el valor y devuelve la oportunidad con su id.",
    "POST",
    "=" + CRM + "/oportunidades",
    "{oportunidad}",
    [(
        "oportunidad",
        'Objeto con clientId (texto), interes (arreglo de {sku, kilosMes}) y notas (texto opcional). '
        'Ejemplo: {"clientId":"c123","interes":[{"sku":"MAN-K","kilosMes":20}],"notas":"Para jugos"}',
        "json",
    )],
)
tool(
    "mover_etapa",
    (4580, 420),
    "Mueve la oportunidad abierta a CONTACTADO, MUESTRA_ENVIADA o NEGOCIACION.",
    "POST",
    "=" + CRM + "/oportunidades/{oportunidadId}/etapa",
    '{ "etapa": {etapa} }',
    [
        ("oportunidadId", "id de la oportunidad abierta (ficha o registrar_interes)", "string"),
        ("etapa", "CONTACTADO, MUESTRA_ENVIADA o NEGOCIACION", "string"),
    ],
)
tool(
    "agendar_visita",
    (4720, 420),
    "Agenda la visita presencial del asesor con la fecha, hora y dirección confirmadas por el cliente. "
    "Pasa la conversación a un asesor.",
    "POST",
    "=" + CRM + "/visitas",
    '{ "clientId": {clientId}, "fecha": {fecha}, "direccion": {direccion}, "barrio": {barrio}, "notas": {notas} }',
    [
        ("clientId", "clientId del cliente", "string"),
        ("fecha", "Fecha y hora ISO 8601 con zona de Bogotá, p. ej. 2026-10-16T10:00:00-05:00", "string"),
        ("direccion", "Dirección exacta del negocio", "string"),
        ("barrio", "Barrio; texto vacío si no lo dijo", "string"),
        ("notas", "Lo que el asesor debe saber para la visita", "string"),
    ],
)
tool(
    "escalar_a_humano",
    (4860, 420),
    "Pasa la conversación a un asesor humano y le deja una tarea con el resumen.",
    "POST",
    "=" + CRM + "/escalar",
    '={ "telefono": "' + PHONE + '", "motivo": {motivo}, "resumen": {resumen} }',
    [
        ("motivo", "Motivo corto, p. ej. Pedido confirmado", "string"),
        ("resumen", "Resumen para el asesor: quién es, qué necesita y qué se le prometió", "string"),
    ],
)
tool(
    "descartar_lead",
    (5000, 420),
    "Cierra la conversación de alguien sin negocio de alimentos o fuera de cobertura, sin crear cliente.",
    "POST",
    "=" + CRM + "/conversaciones/descartar",
    '={ "telefono": "' + PHONE + '", "motivo": {motivo}, "detalle": {detalle} }',
    [
        ("motivo", "FUERA_DE_COBERTURA, SIN_NEGOCIO u OTRO", "string"),
        ("detalle", "Detalle breve, p. ej. la ciudad", "string"),
    ],
)
tool(
    "registrar_autorizacion_comercial",
    (5140, 420),
    "Registra que el cliente aceptó que le escribas más adelante (seguimientos). Úsala solo si dijo que sí.",
    "POST",
    "=" + CRM + "/conversaciones/consentimiento",
    '={ "telefono": "' + PHONE + '", "tipo": "COMERCIAL", "acepta": {acepta} }',
    [("acepta", "true si aceptó que le escribas más adelante", "boolean")],
)

# Respuesta
code("Preparar respuesta", "preparar-respuesta.js", (4400, -20), onError="continueErrorOutput")
code("Respaldo por falla", "respaldo.js", (4620, 220))
connect("David · Agente IA", "Preparar respuesta", 0)
connect("David · Agente IA", "Respaldo por falla", 1)
connect("Preparar respuesta", "Respaldo por falla", 1)

node(
    "Mensaje a enviar",
    "n8n-nodes-base.set",
    3.4,
    {
        "assignments": {
            "assignments": [
                {"id": uid("me-tel"), "name": "telefono", "value": "={{ $json.telefono }}", "type": "string"},
                {"id": uid("me-txt"), "name": "texto", "value": "={{ $json.texto }}", "type": "string"},
                {"id": uid("me-trz"), "name": "traza", "value": "={{ $json.traza ?? {} }}", "type": "object"},
            ]
        },
        "options": {},
    },
    (4840, -20),
)
http(
    "Meta · Enviar texto",
    (5280, -20),
    "POST",
    "=" + GRAPH + "/{{ " + CFG + ".phoneNumberId }}/messages",
    "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $json.telefono, type: 'text', "
    "text: { preview_url: true, body: $json.texto } }) }}",
    META_CRED,
    onError="continueErrorOutput",
    **RETRY,
)
http(
    "CRM · Registrar saliente",
    (5500, -20),
    "POST",
    "=" + CRM + "/conversaciones/mensajes",
    "={{ JSON.stringify({ telefono: $('Mensaje a enviar').item.json.telefono, waMessageId: $json.messages[0].id, "
    "direccion: 'SALIENTE', texto: $('Mensaje a enviar').item.json.texto, "
    "traza: Object.keys($('Mensaje a enviar').item.json.traza ?? {}).length ? $('Mensaje a enviar').item.json.traza : undefined }) }}",
    CRM_CRED,
    **RETRY,
)
http(
    "CRM · Escalar por falla",
    (4840, 300),
    "POST",
    "=" + CRM + "/escalar",
    "={{ JSON.stringify({ telefono: $json.telefono, motivo: 'Falla del agente IA', resumen: $json.detalle }) }}",
    CRM_CRED,
    onError="continueRegularOutput",
)
node(
    "Envío fallido",
    "n8n-nodes-base.stopAndError",
    1,
    {"errorMessage": "={{ 'WhatsApp no aceptó el mensaje para ' + $('Mensaje a enviar').item.json.telefono }}"},
    (5500, 160),
)
connect("Confirmar palabra clave", "Mensaje a enviar")
connect("Preparar respuesta", "Mensaje a enviar", 0)
connect("Respaldo por falla", "Mensaje a enviar")
connect("Respaldo por falla", "CRM · Escalar por falla")
node("Uno por uno", "n8n-nodes-base.splitInBatches", 3, {"options": {}}, (5060, -20))
connect("Mensaje a enviar", "Uno por uno")
connect("Uno por uno", "Meta · Enviar texto", 1)
connect("Meta · Enviar texto", "CRM · Registrar saliente", 0)
connect("CRM · Registrar saliente", "Uno por uno")
connect("Meta · Enviar texto", "Envío fallido", 1)

# ── 3. Envío del asesor desde el CRM (CD-8) ─────────────────────────────
node(
    "CRM · Envío del asesor",
    "n8n-nodes-base.webhook",
    2.1,
    {
        "httpMethod": "POST",
        "path": "dicampo-envio-asesor",
        "authentication": "headerAuth",
        "responseMode": "responseNode",
        "options": {},
    },
    (-1400, 640),
    webhookId=uid("wh-asesor"),
    credentials=CRM_SECRET_CRED,
)
node(
    "Config (asesor)",
    "n8n-nodes-base.set",
    3.4,
    {
        "assignments": {
            "assignments": [
                {"id": uid("cfg2-" + k), "name": k, "value": v, "type": "string"}
                for k, v in CONFIG_FIELDS
                if k in ("graphUrl", "phoneNumberId")
            ]
        },
        "includeOtherFields": True,
        "options": {},
    },
    (-1180, 640),
)
node(
    "Meta · Enviar texto del asesor",
    "n8n-nodes-base.httpRequest",
    4.3,
    {
        "method": "POST",
        "url": "={{ $json.graphUrl }}/{{ $json.phoneNumberId }}/messages",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpBearerAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ messaging_product: 'whatsapp', to: $json.body.telefono, type: 'text', "
        "text: { preview_url: true, body: $json.body.texto } }) }}",
        "options": {},
    },
    (-960, 640),
    credentials=META_CRED,
    onError="continueErrorOutput",
    **RETRY,
)
node(
    "Responder waMessageId",
    "n8n-nodes-base.respondToWebhook",
    1.4,
    {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ waMessageId: $json.messages[0].id }) }}",
        "options": {"responseCode": 200},
    },
    (-720, 560),
)
node(
    "Responder error",
    "n8n-nodes-base.respondToWebhook",
    1.4,
    {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ error: 'WhatsApp no aceptó el mensaje' }) }}",
        "options": {"responseCode": 502},
    },
    (-720, 720),
)
connect("CRM · Envío del asesor", "Config (asesor)")
connect("Config (asesor)", "Meta · Enviar texto del asesor")
connect("Meta · Enviar texto del asesor", "Responder waMessageId", 0)
connect("Meta · Enviar texto del asesor", "Responder error", 1)

sticky(
    "Nota · Configuración",
    "## Antes de activar\n"
    "1. **Config**: `phoneNumberId`, `metaAppSecret` y, si hay, `catalogoUrl`.\n"
    "2. **¿Token de verificación correcto?**: cambia `PEGAR_VERIFY_TOKEN` por el mismo token que pongas en Meta.\n"
    "3. Credenciales: *CRM Dicampo · Agente IA* (Header Auth `Authorization: Bearer <AGENTE_API_KEY>`), "
    "*Meta WhatsApp · Token* (Bearer, token permanente del System User), *OpenAI* y "
    "*CRM → n8n · X-CRM-Secret* (Header Auth `X-CRM-Secret: <N8N_ENVIO_SECRET>`).\n"
    "4. En Meta, URL del webhook: `<n8n>/webhook/dicampo-whatsapp`, campo `messages`.\n"
    "5. En Netlify: `N8N_ENVIO_WEBHOOK_URL=<n8n>/webhook/dicampo-envio-asesor`.",
    (-1460, -900),
    620,
    300,
    color=4,
)
sticky(
    "Nota · Flujo",
    "## Mensaje entrante\nFirma → desglose → archivo a Storage → registro (idempotente) → palabra clave → "
    "espera de ráfaga → contexto → ¿último?, ¿bot?, ¿aviso? → agente → envío → registro.\n"
    "Si el agente falla: mensaje de respaldo y escalamiento al asesor.",
    (-760, -900),
    560,
    200,
)

POS = {
    "David · Agente IA": (4420, -20),
    "Modelo OpenAI": (4200, 240),
    "Preparar respuesta": (4740, -20),
    "Respaldo por falla": (4960, -240),
    "CRM · Escalar por falla": (5180, -260),
    "Mensaje a enviar": (5180, -20),
    "Uno por uno": (5400, -20),
    "Meta · Enviar texto": (5620, 0),
    "CRM · Registrar saliente": (5840, -100),
    "Envío fallido": (5840, 120),
}
TOOLS = ["buscar_conocimiento", "registrar_lead", "actualizar_lead", "registrar_interes", "mover_etapa",
         "agendar_visita", "escalar_a_humano", "descartar_lead", "registrar_autorizacion_comercial"]
for i, t in enumerate(TOOLS):
    POS[t] = (4340 + i * 150, 300 + (i % 2) * 120)
for n in nodes:
    if n["name"] in POS:
        n["position"] = list(POS[n["name"]])

workflow = {
    "name": "Dicampo · Agente WhatsApp",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1", "saveDataErrorExecution": "all", "saveDataSuccessExecution": "all"},
    "pinData": {},
    "meta": {"templateCredsSetupCompleted": False},
    "tags": [],
}

out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "dicampo-agente-whatsapp.json"
out.write_text(json.dumps(workflow, ensure_ascii=False, indent=2))
print(f"{len(nodes)} nodos → {out}")
