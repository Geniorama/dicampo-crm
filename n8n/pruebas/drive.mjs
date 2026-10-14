import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
const LOG = process.argv[2];
const URL_ = "http://localhost:5678/webhook/dicampo-whatsapp";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (label, ok, detail = "") => { ok ? oks++ : fails++; console.log(`  ${ok ? "OK   " : "FALLO"} ${label}${ok ? "" : " -- " + JSON.stringify(detail).slice(0, 1500)}`); };
const logs = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const sends = (to) => logs().filter((l) => l.srv === "meta" && l.kind === "send" && l.to === to);
const PHONES = ["573000000901", "573000000902", "573000000903", "573000000904"];
let seq = 0;
const ts = () => String(Math.floor(Date.now() / 1000));
function payload(msgs = [], statuses = [], phoneId = "PNID") {
  return { object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "573107296238", phone_number_id: phoneId },
    contacts: msgs.map((m) => ({ wa_id: m.from, profile: { name: "María" } })), messages: msgs, statuses } }] }] };
}
async function post(body, secret = "testsecret") {
  const raw = JSON.stringify(body);
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const r = await fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig }, body: raw });
  return r.status;
}
const text = (from, body, id = `wamid.IN.${Date.now()}.${++seq}`) => ({ from, id, timestamp: ts(), type: "text", text: { body } });
async function cleanup() {
  await db.query(`delete from "Activity" where "clientId" in (select c.id from "Client" c where c."businessName" like '%ZZVERIF%') or ("clientId" is null and (${PHONES.map((p) => `notes like '%${p}%'`).join(" or ")}))`);
  await db.query(`delete from "WhatsappConversation" where phone = any($1)`, [PHONES]);
  await db.query(`delete from "Client" where "businessName" like '%ZZVERIF%'`);
}
const conv = async (p) => (await db.query(`select * from "WhatsappConversation" where phone=$1`, [p])).rows[0];
const msgs = async (p) => (await db.query(`select m.* from "WhatsappMessage" m join "WhatsappConversation" c on c.id=m."conversationId" where c.phone=$1 order by m."createdAt"`, [p])).rows;

await cleanup();
try {
  console.log("S1 · Primer mensaje de un número nuevo");
  const first = text(PHONES[0], "Hola, quiero información de las pulpas");
  check("webhook responde 200", (await post(payload([first]))) === 200);
  await sleep(9000);
  let s = sends(PHONES[0]);
  check("se envía el aviso de privacidad y luego la respuesta", s.length === 2 && s[0].body.includes("política de privacidad") && s[1].body.includes("David"), s);
  check("Meta recibe el token Bearer", s.every((x) => x.auth === "Bearer metatoken"), s.map((x) => x.auth));
  let c = await conv(PHONES[0]);
  check("conversación con aviso registrado (versión 2026-01)", c?.consentAt && c.consentVersion === "2026-01", c);
  let m = await msgs(PHONES[0]);
  check("CRM tiene entrante + aviso + respuesta", m.length === 3 && m[0].direction === "ENTRANTE" && m[2].author === "AGENTE_IA", m.map((x) => [x.direction, x.author, x.body?.slice(0, 30)]));
  const an = logs().filter((l) => l.srv === "anthropic");
  const firstCall = an[0] || {};
  check("modelo claude-haiku-4-5 con 9 herramientas", firstCall.model === "claude-haiku-4-5-20251001" && firstCall.tools?.length === 9, { model: firstCall.model, tools: firstCall.tools });
  check("el prompt trae hora de Bogotá y el mensaje nuevo", /America\/Bogota/.test(firstCall.prompt) && firstCall.prompt.includes("quiero información"), firstCall.prompt);
  check("el system prompt trae la regla del catálogo", /Aún no hay enlace al catálogo/.test(firstCall.system || ""), (firstCall.system || "").slice(-300));
  fs.writeFileSync((process.env.SALIDA || "/tmp") + "/first-call.json", JSON.stringify(firstCall, null, 2));

  console.log("S2 · Ráfaga: dos mensajes seguidos y herramientas del CRM");
  const before = sends(PHONES[0]).length;
  await post(payload([text(PHONES[0], "Soy María, tengo un restaurante en Chapinero")]));
  await sleep(1200);
  await post(payload([text(PHONES[0], "Usamos unos 16 kilos de mango al mes")]));
  await sleep(14000);
  s = sends(PHONES[0]).slice(before);
  check("una sola respuesta para la ráfaga, partida en 2 mensajes", s.length === 2 && s[1].body.startsWith("¿Qué día"), s);
  check("negrita convertida al formato de WhatsApp", s[0]?.body.includes("*8 jugos exactos*") && !s[0]?.body.includes("**"), s[0]);
  const lead = (await db.query(`select c.id, c.status, c."businessName", c."ownerId" from "Client" c join "Contact" k on k."clientId"=c.id where k."whatsappE164"=$1`, [PHONES[0]])).rows[0];
  check("registrar_lead creó el prospecto con vendedor", lead?.status === "PROSPECTO" && lead.businessName === "ZZVERIF Restaurante María" && lead.ownerId, lead);
  const opp = lead && (await db.query(`select stage, "estimatedValue" from "Opportunity" where "clientId"=$1`, [lead.id])).rows[0];
  check("registrar_interes valoró la oportunidad", opp && Number(opp.estimatedValue) > 0, opp);
  check("el agente usó el clientId que devolvió registrar_lead", s[1]?.body.includes(`clientId=${lead?.id}`), s[1]);
  m = await msgs(PHONES[0]);
  const replies = m.filter((x) => x.author === "AGENTE_IA");
  const reply = replies.find((x) => x.body?.includes("8 jugos exactos"));
  check("en el CRM quedan en el orden en que se enviaron", replies.indexOf(reply) === replies.length - 2 && replies.at(-1).body.startsWith("¿Qué día"), replies.map((x) => x.body.slice(0, 20)));
  check("traza con herramientas y fuentes en el primer mensaje", JSON.stringify(reply?.agentTrace?.herramientas) === JSON.stringify(["registrar_lead", "buscar_conocimiento", "registrar_interes"]) && reply.agentTrace.fuentes?.length > 0, reply?.agentTrace);
  const steps = logs().filter((l) => l.srv === "anthropic" && l.prompt?.includes("Chapinero"));
  check("el prompt agrupa los dos mensajes como nuevos", steps[0]?.prompt.includes("Chapinero\nUsamos unos 16 kilos"), steps[0]?.prompt);
  fs.writeFileSync((process.env.SALIDA || "/tmp") + "/burst-call.json", JSON.stringify(logs().filter((l) => l.srv === "anthropic").slice(-4), null, 2));

  console.log("S3 · Reintento de Meta y firma inválida");
  const n0 = sends(PHONES[0]).length;
  const dup = text(PHONES[0], "mensaje repetido");
  await post(payload([dup])); await sleep(500); await post(payload([dup]));
  await sleep(8000);
  const n1 = sends(PHONES[0]).length;
  check("el reintento no genera otra respuesta (1 respuesta en total)", n1 - n0 === 1, n1 - n0);
  const cnt = (await db.query(`select count(*) from "WhatsappMessage" where "waMessageId"=$1`, [dup.id])).rows[0].count;
  check("el mensaje queda una sola vez", cnt === "1", cnt);
  await post(payload([text(PHONES[0], "firma mala")]), "otro-secreto");
  await sleep(5000);
  check("firma inválida: nada se registra ni se envía", sends(PHONES[0]).length === n1 && !(await msgs(PHONES[0])).some((x) => x.body === "firma mala"));
  await post(payload([text(PHONES[0], "otro número de negocio")], [], "OTRO_PNID"));
  await sleep(4000);
  check("evento de otro phone_number_id: se ignora", !(await msgs(PHONES[0])).some((x) => x.body === "otro número de negocio"));

  console.log("S4 · Estados de entrega");
  const out = (await msgs(PHONES[0])).filter((x) => x.direction === "SALIENTE").at(-1);
  await post(payload([], [{ id: out.waMessageId, status: "read", timestamp: ts(), recipient_id: PHONES[0] }, { id: "wamid.desconocido", status: "delivered", timestamp: ts() }]));
  await sleep(3000);
  const st = (await db.query(`select "deliveryStatus" from "WhatsappMessage" where id=$1`, [out.id])).rows[0];
  check("'read' queda registrado; un wamid desconocido no rompe el flujo", st.deliveryStatus === "read", st);

  console.log("S5 · Imagen");
  await post(payload([{ from: PHONES[1], id: `wamid.IMG.${Date.now()}`, timestamp: ts(), type: "image", image: { id: "MEDIA1", mime_type: "image/png", caption: "así es mi local" } }]));
  await sleep(9000);
  m = await msgs(PHONES[1]);
  const img = m.find((x) => x.type === "IMAGEN");
  check("imagen subida a Storage y registrada con su ruta", img?.mediaPath?.startsWith(`${PHONES[1]}/`) && img.mediaMime === "image/png" && img.body === "así es mi local", img);
  const put = logs().find((l) => l.srv === "storage" && l.kind === "put");
  check("PUT con el binario, Content-Type y x-upsert", put?.bytes > 60 && put.ctype === "image/png" && put.upsert === "true", put);
  check("y el agente respondió", sends(PHONES[1]).length === 2, sends(PHONES[1]));

  console.log("S6 · Palabra clave CANCELAR");
  await post(payload([text(PHONES[2], "CANCELAR")]));
  await sleep(6000);
  s = sends(PHONES[2]);
  check("solo la confirmación de baja, sin agente", s.length === 1 && s[0].body.startsWith("Listo, no te enviaremos"), s);
  c = await conv(PHONES[2]);
  check("baja registrada", Boolean(c?.optOutAt), c);

  console.log("S7 · Falla del modelo");
  await post(payload([text(PHONES[3], "FALLA prueba")]));
  await sleep(12000);
  s = sends(PHONES[3]);
  check("mensaje de respaldo al cliente", s.at(-1)?.body.includes("inconveniente"), s);
  c = await conv(PHONES[3]);
  check("conversación escalada a un asesor (HUMANO)", c?.status === "HUMANO", c?.status);
  const task = (await db.query(`select subject, notes from "Activity" where notes like $1 order by "createdAt" desc limit 1`, [`%${PHONES[3]}%`])).rows[0];
  check("tarea para el asesor con el detalle del error", task?.subject.includes("Falla del agente IA") && task.notes.includes("no pudo responder"), task);

  console.log("S8 · Conversación en manos de un asesor");
  const k = sends(PHONES[3]).length;
  await post(payload([text(PHONES[3], "hola? sigue ahí?")]));
  await sleep(7000);
  check("el bot no responde si está en HUMANO", sends(PHONES[3]).length === k);
  check("pero el mensaje queda registrado", (await msgs(PHONES[3])).some((x) => x.body === "hola? sigue ahí?"));

  console.log("S9 · Envío del asesor desde el CRM");
  let r = await fetch("http://localhost:5678/webhook/dicampo-envio-asesor", { method: "POST", headers: { "Content-Type": "application/json", "X-CRM-Secret": "secreto-envio" }, body: JSON.stringify({ telefono: PHONES[3], texto: "Hola, soy Carolina de Dicampo", conversacionId: "x", asesor: { id: "u", nombre: "Carolina" } }) });
  let j = await r.json().catch(() => null);
  check("200 con waMessageId", r.status === 200 && /^wamid\.OUT/.test(j?.waMessageId), { status: r.status, j });
  check("Meta recibe el texto del asesor", sends(PHONES[3]).at(-1)?.body === "Hola, soy Carolina de Dicampo");
  r = await fetch("http://localhost:5678/webhook/dicampo-envio-asesor", { method: "POST", headers: { "Content-Type": "application/json", "X-CRM-Secret": "malo" }, body: "{}" });
  check("secreto incorrecto → 403", r.status === 403, r.status);
  r = await fetch("http://localhost:5678/webhook/dicampo-envio-asesor", { method: "POST", headers: { "Content-Type": "application/json", "X-CRM-Secret": "secreto-envio" }, body: JSON.stringify({ telefono: "573000000999", texto: "x" }) });
  check("Meta rechaza → 502 para que el CRM avise", r.status === 502, r.status);
} finally {
  await cleanup();
  await db.end();
  console.log(`\n${oks} OK · ${fails} fallos`);
}
