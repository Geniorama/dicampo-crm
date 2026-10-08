/* eslint-disable @typescript-eslint/no-explicit-any -- inspecciona JSON arbitrario de la API */
import "dotenv/config";
import { prisma } from "../src/server/db";

/**
 * Regresión de la API del agente IA (`/api/agente/*`) contra un CRM
 * desplegado, por HTTP y con la llave real: recorre el flujo de un lead por
 * WhatsApp de punta a punta y comprueba códigos, contratos y reglas.
 *
 * Todo usa números 57300000090X (no existen en Colombia) y clientes con la
 * marca `ZZVERIF`. Lo que crea se borra al empezar (por si una corrida se
 * cortó) y al terminar, directo en la base de `DATABASE_URL`, que debe ser la
 * misma del CRM que se prueba. No sube archivos a Storage: solo pide la firma.
 *
 *   CRM_URL=https://crm.dicampo.co AGENTE_API_KEY=... npx tsx scripts/verificar-api-agente.ts
 *
 * Sale con código 1 si algo falla.
 */

const BASE = (process.env.CRM_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.AGENTE_API_KEY ?? "";
const TAG = "ZZVERIF";

/** Lead completo, descarte y baja: un número por historia. */
const PHONE_LEAD = "573000000901";
const PHONE_DESCARTE = "573000000902";
const PHONE_BAJA = "573000000903";
const PHONES = [PHONE_LEAD, PHONE_DESCARTE, PHONE_BAJA];
const RUN = Date.now().toString(36);
const wamid = (n: string) => `wamid.${TAG}.${RUN}.${n}`;

let fails = 0;
let passes = 0;
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (ok) passes += 1;
  else fails += 1;
  const extra = ok ? "" : ` -- ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  console.log(`  ${ok ? "OK   " : "FALLO"} ${label}${extra}`);
};
const section = (title: string) => console.log(`\n${title}`);

type Res = { status: number; body: any };

async function call(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  key: string | null = KEY,
): Promise<Res> {
  const headers: Record<string, string> = {};
  if (key !== null) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}/api/agente${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // se deja el texto: el fallo lo mostrará
  }
  return { status: response.status, body: parsed };
}

const data = (res: Res) => res.body?.data;

/** Borra todo lo de prueba. Solo toca los números de prueba y clientes ZZVERIF. */
async function cleanup() {
  const contacts = await prisma.contact.findMany({
    where: { whatsappE164: { in: PHONES } },
    select: { clientId: true, client: { select: { businessName: true } } },
  });
  const clientIds = [
    ...new Set(
      contacts.filter((c) => c.client.businessName.includes(TAG)).map((c) => c.clientId),
    ),
  ];
  const foreign = contacts.filter((c) => !c.client.businessName.includes(TAG));
  if (foreign.length > 0) {
    throw new Error(
      `Los números de prueba están en clientes reales (${foreign.map((c) => c.client.businessName).join(", ")}). No se toca nada.`,
    );
  }

  // Tareas que pudieron quedar sin cliente (escalamientos de un número suelto).
  const activities = await prisma.activity.deleteMany({
    where: {
      clientId: null,
      OR: PHONES.map((phone) => ({ notes: { contains: phone } })),
    },
  });
  const conversations = await prisma.whatsappConversation.deleteMany({
    where: { phone: { in: PHONES } },
  });
  const clients = await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  return { clientes: clients.count, conversaciones: conversations.count, tareasSueltas: activities.count };
}

async function main() {
  if (!KEY) throw new Error("Falta AGENTE_API_KEY.");
  console.log(`API del agente en ${BASE}`);
  const before = await cleanup();
  if (before.clientes + before.conversaciones + before.tareasSueltas > 0) {
    console.log(`  (restos de una corrida anterior borrados: ${JSON.stringify(before)})`);
  }

  const sku = await prisma.productVariant.findFirst({
    where: { active: true, priceItems: { some: { priceList: { isDefault: true } } } },
    orderBy: { sku: "asc" },
    select: { sku: true },
  });
  if (!sku) throw new Error("No hay una variante activa con precio en la lista por defecto.");

  // ── 1. Autenticación ──────────────────────────────────────
  section("1. Autenticación");
  {
    const none = await call("GET", "/estado", undefined, null);
    check("sin llave → 401", none.status === 401, none);
    const bad = await call("GET", "/estado", undefined, "x".repeat(40));
    check("llave equivocada → 401", bad.status === 401, bad);
    const good = await call("GET", "/estado");
    check("llave correcta → 200 con el usuario agente", good.status === 200 && data(good)?.agent?.email === "agente-ia@dicampo.co", good);
  }

  // ── 2. Primer contacto ────────────────────────────────────
  section("2. Primer contacto de un número nuevo");
  {
    const state = await call("GET", `/conversaciones/estado?telefono=${PHONE_LEAD}`);
    check("estado de un número nuevo: no existe, en BOT", state.status === 200 && data(state)?.existe === false && data(state)?.estado === "BOT", state);

    const inbound = { telefono: PHONE_LEAD, waMessageId: wamid("in1"), direccion: "ENTRANTE", texto: `Hola, tengo un restaurante (${TAG})` };
    const first = await call("POST", "/conversaciones/mensajes", inbound);
    check("entrante nuevo → 201", first.status === 201 && data(first)?.creado === true, first);
    const retry = await call("POST", "/conversaciones/mensajes", inbound);
    check("reintento del mismo wamid → 200 sin duplicar", retry.status === 200 && data(retry)?.creado === false && data(retry)?.mensaje?.id === data(first)?.mensaje?.id, retry);

    const opened = await call("GET", `/conversaciones/estado?telefono=${PHONE_LEAD}`);
    check("la ventana de 24 h queda abierta", data(opened)?.ventana?.abierta === true, data(opened)?.ventana);

    const aviso = await call("POST", "/conversaciones/consentimiento", { telefono: PHONE_LEAD, tipo: "AVISO", versionPolitica: "2026-01" });
    check("aviso de privacidad registrado", aviso.status === 200 && Boolean(data(aviso)?.consentimiento?.aviso), aviso);
    const comercial = await call("POST", "/conversaciones/consentimiento", { telefono: PHONE_LEAD, tipo: "COMERCIAL" });
    check("autorización comercial registrada", comercial.status === 200 && Boolean(data(comercial)?.consentimiento?.comercial), comercial);
  }

  // ── 3. Lead ───────────────────────────────────────────────
  section("3. Lead");
  let clientId = "";
  {
    const missing = await call("GET", `/leads?telefono=${PHONE_LEAD}`);
    check("número sin registrar → null", missing.status === 200 && data(missing) === null, missing);

    const badPhone = await call("POST", "/leads", { telefono: "123", nombreContacto: "Prueba" });
    check("teléfono inválido → 422", badPhone.status === 422, badPhone);

    const lead = { telefono: PHONE_LEAD, nombreContacto: `${TAG} Prueba`, negocio: `${TAG} Restaurante`, tipo: "RESTAURANTE" };
    const created = await call("POST", "/leads", lead);
    clientId = data(created)?.cliente?.id ?? "";
    check("crear lead → 201 PROSPECTO", created.status === 201 && data(created)?.cliente?.estado === "PROSPECTO", created);
    check("quedó con vendedor asignado", Boolean(data(created)?.vendedor?.id), data(created)?.vendedor ?? "sin vendedor activo");

    const again = await call("POST", "/leads", lead);
    check("crear otra vez → 200 el mismo cliente", again.status === 200 && data(again)?.cliente?.id === clientId, again);

    const other = await call("GET", `/leads?telefono=${encodeURIComponent("+57 300 000 0901")}`);
    check("se encuentra con otro formato de número", data(other)?.cliente?.id === clientId, other);

    const patch = await call("PATCH", `/leads/${clientId}`, {
      cargoContacto: "Chef",
      sede: { direccion: "Calle 1 # 2-3 (prueba)", barrio: "Chapinero" },
    });
    check("completar datos y sede → 200", patch.status === 200 && Boolean(data(patch)?.sedePrincipal?.direccion), patch);
  }

  // ── 4. Oportunidad ────────────────────────────────────────
  section("4. Oportunidad");
  let opportunityId = "";
  {
    const first = await call("POST", "/oportunidades", { clientId, interes: [{ sku: sku.sku, kilosMes: 10 }] });
    opportunityId = data(first)?.oportunidad?.id ?? "";
    const value1 = data(first)?.oportunidad?.valorEstimado ?? 0;
    check(`interés en ${sku.sku} → 201 valorada`, first.status === 201 && value1 > 0, first);

    const second = await call("POST", "/oportunidades", { clientId, interes: [{ sku: sku.sku, kilosMes: 20 }] });
    const value2 = data(second)?.oportunidad?.valorEstimado ?? 0;
    check("nuevo interés → 200 revalora la misma", second.status === 200 && data(second)?.oportunidad?.id === opportunityId && value2 > value1, second);

    const unknown = await call("POST", "/oportunidades", { clientId, interes: [{ sku: "NO-EXISTE", kilosMes: 5 }] });
    check("SKU inexistente → error de validación", unknown.status === 422 || unknown.status === 404, unknown);

    const stage = await call("POST", `/oportunidades/${opportunityId}/etapa`, { etapa: "NEGOCIACION" });
    check("mover a NEGOCIACION → 200", stage.status === 200 && data(stage)?.etapa === "NEGOCIACION", stage);
    const win = await call("POST", `/oportunidades/${opportunityId}/etapa`, { etapa: "GANADA" });
    check("el agente no puede ganar → 422", win.status === 422, win);
  }

  // ── 5. Bitácora, mensajes salientes y entregas ────────────
  section("5. Bitácora, salientes y entregas");
  {
    const log = await call("POST", "/actividades", { clientId, asunto: "Resumen de la conversación (prueba)", notas: "Calificado." });
    check("resumen en la bitácora → 201", log.status === 201 && Boolean(data(log)?.id), log);

    const out = await call("POST", "/conversaciones/mensajes", {
      telefono: PHONE_LEAD,
      waMessageId: wamid("out1"),
      direccion: "SALIENTE",
      texto: "¡Hola! Soy David, de Dicampo.",
      traza: { herramientas: ["buscar_kb"], fuentes: [] },
    });
    check("saliente del agente → 201 con autor AGENTE_IA", out.status === 201 && data(out)?.mensaje?.autor === "AGENTE_IA", out);

    const state = await call("GET", `/conversaciones/estado?telefono=${PHONE_LEAD}`);
    check("quedó programado el primer seguimiento", Boolean(data(state)?.seguimientos?.proximo), data(state)?.seguimientos);

    const delivered = await call("POST", "/conversaciones/entregas", { waMessageId: wamid("out1"), estado: "delivered" });
    check("entregado → avanza", delivered.status === 200 && data(delivered)?.actualizado === true, delivered);
    const late = await call("POST", "/conversaciones/entregas", { waMessageId: wamid("out1"), estado: "sent" });
    check("un 'sent' tardío no retrocede", late.status === 200 && data(late)?.actualizado === false && data(late)?.estado === "delivered", late);
    const ghost = await call("POST", "/conversaciones/entregas", { waMessageId: wamid("nada"), estado: "read" });
    check("estado de un mensaje desconocido → 404", ghost.status === 404, ghost);
  }

  // ── 6. Multimedia ─────────────────────────────────────────
  section("6. Multimedia (solo la firma)");
  {
    const sign = await call("POST", "/conversaciones/media", { telefono: PHONE_LEAD, mime: "image/png", bytes: 1024, waMessageId: wamid("img") });
    if (sign.status === 503) {
      console.log("  OMITIDO Storage no está configurado en este entorno");
    } else {
      check(
        "firma de subida → 201 en la carpeta del número",
        sign.status === 201 && String(data(sign)?.ruta).startsWith(`${PHONE_LEAD}/`) && data(sign)?.metodo === "PUT",
        sign,
      );
    }
    const video = await call("POST", "/conversaciones/media", { telefono: PHONE_LEAD, mime: "video/mp4", bytes: 1024 });
    check("tipo no permitido → 422", video.status === 422, video);
    const big = await call("POST", "/conversaciones/media", { telefono: PHONE_LEAD, mime: "image/png", bytes: 50 * 1024 * 1024 });
    check("archivo demasiado grande → 422", big.status === 422, big);
    const foreign = await call("POST", "/conversaciones/mensajes", {
      telefono: PHONE_LEAD,
      waMessageId: wamid("img2"),
      direccion: "ENTRANTE",
      tipo: "IMAGEN",
      media: { ruta: `${PHONE_BAJA}/2026-10/ajeno.png`, mime: "image/png" },
    });
    check("archivo de otro número → rechazado", foreign.status === 422, foreign);
  }

  // ── 7. Visita y escalamiento ──────────────────────────────
  section("7. Visita y escalamiento");
  {
    const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    const visit = await call("POST", "/visitas", {
      clientId,
      fecha: `${tomorrow}T10:00:00-05:00`,
      direccion: "Calle 1 # 2-3 (prueba)",
      notas: "Prueba automática",
    });
    check("visita → 201 en la agenda del vendedor", visit.status === 201 && data(visit)?.asignadaA?.esVendedor === true, visit);
    check("la conversación pasa a HUMANO", data(visit)?.conversacion?.estado === "HUMANO", data(visit)?.conversacion);
    check(
      "la hora queda en Bogotá (15:00 UTC)",
      new Date(data(visit)?.visita?.fecha).toISOString() === `${tomorrow}T15:00:00.000Z`,
      data(visit)?.visita,
    );
    const noOffset = await call("POST", "/visitas", { clientId, fecha: `${tomorrow}T10:00:00`, direccion: "Calle 1 # 2-3" });
    check("fecha sin zona → 422", noOffset.status === 422, noOffset);

    const escalate = await call("POST", "/escalar", { telefono: PHONE_LEAD, motivo: "Pide precio especial", resumen: "Prueba automática" });
    check("escalar ya escalada → 200 sin tarea nueva", escalate.status === 200 && data(escalate)?.yaEstabaEscalada === true && data(escalate)?.tareaId === null, escalate);

    const pending = await call("GET", "/seguimientos/pendientes?limite=200");
    const phones = (data(pending) ?? []).map((item: any) => item.telefono);
    check("una conversación en HUMANO no recibe seguimientos", pending.status === 200 && !phones.includes(PHONE_LEAD), pending.status);
  }

  // ── 8. Descarte ───────────────────────────────────────────
  section("8. Descarte (fuera de cobertura)");
  {
    await call("POST", "/conversaciones/mensajes", { telefono: PHONE_DESCARTE, waMessageId: wamid("d1"), direccion: "ENTRANTE", texto: "Hola, estoy en Medellín" });
    const out = await call("POST", "/conversaciones/descartar", { telefono: PHONE_DESCARTE, motivo: "FUERA_DE_COBERTURA", detalle: "Medellín" });
    check("descartar → CERRADA con motivo", out.status === 200 && data(out)?.estado === "CERRADA" && data(out)?.descartada?.motivo === "FUERA_DE_COBERTURA", out);
    const lead = await call("GET", `/leads?telefono=${PHONE_DESCARTE}`);
    check("no se creó cliente", data(lead) === null, lead);
    const back = await call("POST", "/conversaciones/mensajes", { telefono: PHONE_DESCARTE, waMessageId: wamid("d2"), direccion: "ENTRANTE", texto: "¿Y a Funza?" });
    check("si vuelve a escribir, se reabre en BOT", data(back)?.conversacion?.estado === "BOT", back);
  }

  // ── 9. Baja y supresión ───────────────────────────────────
  section("9. Baja y supresión de datos");
  {
    await call("POST", "/conversaciones/consentimiento", { telefono: PHONE_BAJA, tipo: "COMERCIAL" });
    const stop = await call("POST", "/conversaciones/mensajes", { telefono: PHONE_BAJA, waMessageId: wamid("b1"), direccion: "ENTRANTE", texto: "cancelar" });
    check("\"cancelar\" → palabraClave BAJA", stop.status === 201 && data(stop)?.palabraClave === "BAJA", stop);
    const state = await call("GET", `/conversaciones/estado?telefono=${PHONE_BAJA}`);
    check("queda la baja registrada", Boolean(data(state)?.consentimiento?.baja), data(state)?.consentimiento);
    const normal = await call("POST", "/conversaciones/mensajes", { telefono: PHONE_BAJA, waMessageId: wamid("b2"), direccion: "ENTRANTE", texto: "quiero cancelar el pedido" });
    check("una frase normal no es baja", data(normal)?.palabraClave === null, normal);

    const erase = await call("POST", "/conversaciones/mensajes", { telefono: PHONE_LEAD, waMessageId: wamid("e1"), direccion: "ENTRANTE", texto: "ELIMINAR MIS DATOS" });
    check("\"ELIMINAR MIS DATOS\" → palabraClave ELIMINAR_DATOS", data(erase)?.palabraClave === "ELIMINAR_DATOS", erase);
    const task = await prisma.activity.findFirst({
      where: { clientId, subject: { contains: "supresión" } },
      select: { user: { select: { role: true } } },
    });
    check("tarea de supresión para un ADMIN", task?.user.role === "ADMIN", task ?? "sin tarea");
  }
}

main()
  .catch((error) => {
    fails += 1;
    console.error("\nError:", error instanceof Error ? error.message : error);
  })
  .finally(async () => {
    try {
      const removed = await cleanup();
      console.log(`\nLimpieza: ${JSON.stringify(removed)}`);
    } catch (error) {
      fails += 1;
      console.error("Limpieza fallida:", error instanceof Error ? error.message : error);
    }
    await prisma.$disconnect();
    console.log(`\n${passes} OK · ${fails} fallos`);
    process.exit(fails > 0 ? 1 : 0);
  });
