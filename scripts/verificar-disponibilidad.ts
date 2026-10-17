import "dotenv/config";
import { NextRequest } from "next/server";
import { prisma } from "../src/server/db";
import type { SessionUser } from "../src/server/guards";
import { getVisitAvailability, scheduleVisit } from "../src/server/services/agent";
import {
  createBlock,
  deleteBlock,
  getAdvisorSchedule,
  listVisitAgenda,
  updateAdvisorSchedule,
} from "../src/server/services/visit-schedules";
import { scheduleUpdateSchema } from "../src/server/validators/visit-schedules";
import { visitSchema } from "../src/server/validators/agent";
import { GET as availabilityRoute } from "../src/app/api/agente/visitas/disponibilidad/route";
import { AGENT_USER_EMAIL, AGENT_USER_NAME } from "../src/lib/agent";
import { addDays, todayInBogota } from "../src/lib/visit-schedule";

/**
 * Comprueba de punta a punta la disponibilidad de visitas por asesor contra
 * la base de `DATABASE_URL`: el horario general para quien no configuró nada,
 * el horario propio en lo que ofrece y acepta el agente, las ausencias, el
 * interruptor de visitas, los permisos y la pantalla de agenda.
 *
 * Todo lo que crea lleva la marca `ZZVERIF` (usuarios `zzverif-*`) y se borra
 * al empezar y al terminar. Si el usuario del agente no existe, lo crea y lo
 * borra al final.
 *
 *   npx tsx scripts/verificar-disponibilidad.ts
 */

const TAG = "ZZVERIF";
const API_KEY = "zzverif-llave-de-prueba-de-al-menos-32-caracteres";

let fails = 0;
const check = (label: string, ok: boolean, detail: unknown = "") => {
  const extra = ok ? "" : ` -- ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  console.log(`  ${ok ? "OK   " : "FALLO"} ${label}${extra}`);
  if (!ok) fails += 1;
};

/** Ejecuta y devuelve el nombre de la clase de error, o "ok". */
async function outcome(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.name : String(error);
  }
}

const session = (user: { id: string; name: string; email: string; role: SessionUser["role"] }) =>
  ({ id: user.id, name: user.name, email: user.email, role: user.role }) satisfies SessionUser;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "zzverif-" } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await prisma.client.deleteMany({ where: { businessName: { startsWith: TAG } } });
  await prisma.activity.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

const allSlots = (result: Awaited<ReturnType<typeof getVisitAvailability>>) =>
  result.dias.flatMap((day) => day.franjas.map((slot) => slot.inicio));

async function main() {
  process.env.AGENTE_API_KEY = API_KEY;
  await cleanup();

  // ── Preparación ────────────────────────────────────────────
  let agentCreated = false;
  let agentRow = await prisma.user.findUnique({ where: { email: AGENT_USER_EMAIL } });
  if (!agentRow) {
    agentRow = await prisma.user.create({
      data: { email: AGENT_USER_EMAIL, name: AGENT_USER_NAME, role: "AGENTE_IA" },
    });
    agentCreated = true;
  }
  const agent = session(agentRow);

  const admin = session(
    await prisma.user.create({
      data: { email: "zzverif-admin@dicampo.test", name: `${TAG} Admin`, role: "ADMIN" },
    }),
  );
  const seller = session(
    await prisma.user.create({
      data: { email: "zzverif-asesora@dicampo.test", name: `${TAG} Asesora`, role: "VENDEDOR" },
    }),
  );
  const other = session(
    await prisma.user.create({
      data: { email: "zzverif-otro@dicampo.test", name: `${TAG} Otro`, role: "VENDEDOR" },
    }),
  );
  const bodega = session(
    await prisma.user.create({
      data: { email: "zzverif-bodega@dicampo.test", name: `${TAG} Bodega`, role: "BODEGA" },
    }),
  );

  const client = await prisma.client.create({
    data: {
      businessName: `${TAG} Restaurante`,
      ownerId: seller.id,
      addresses: { create: { label: "Principal", address: "Cra 7 # 45-10", isPrimary: true } },
    },
  });

  // Primer lunes con al menos dos días de margen.
  let monday = addDays(todayInBogota(), 2);
  while (new Date(`${monday}T12:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1);
  const tuesday = addDays(monday, 1);

  // ── Horario general ────────────────────────────────────────
  console.log("\nSin configuración: horario general");
  const general = await getVisitAvailability({ clientId: client.id, desde: monday, dias: 5 });
  check(
    "ofrece lunes a viernes de 9:00 a 3:30, cada 30 min",
    general.dias.length === 5 &&
      general.dias[0].franjas.length === 14 &&
      general.dias[0].franjas[0].inicio === `${monday}T09:00:00-05:00`,
    general.dias.map((day) => `${day.fecha}:${day.franjas.length}`),
  );
  check(
    "el horario en palabras es el general",
    general.horario === "lunes a viernes, de 9:00 a. m. a 4:00 p. m. (hora de Bogotá)" &&
      general.recibeVisitas === true &&
      general.duracionMinutos === 30,
    general,
  );
  const initial = await getAdvisorSchedule(seller, seller.id);
  check(
    "el editor arranca con el horario general",
    initial.usesDefault && initial.windows.length === 5 && initial.settings.visitMinutes === 30,
  );

  // ── Horario propio ─────────────────────────────────────────
  console.log("\nHorario propio");
  const config = scheduleUpdateSchema.parse({
    acceptsVisits: true,
    visitMinutes: 60,
    bufferMinutes: 30,
    minLeadDays: 1,
    maxDaysAhead: 30,
    windows: [
      { weekday: 2, start: "08:00", end: "12:00" },
      { weekday: 2, start: "14:00", end: "17:00" },
      { weekday: 4, start: "08:00", end: "12:00" },
    ],
  });
  check(
    "otro vendedor no puede editar la agenda ajena",
    (await outcome(() => updateAdvisorSchedule(other, seller.id, config))) === "ForbiddenError",
  );
  check(
    "BODEGA no es asesor",
    (await outcome(() => updateAdvisorSchedule(admin, bodega.id, config))) === "NotFoundError",
  );
  check(
    "franjas que se cruzan se rechazan",
    !scheduleUpdateSchema.safeParse({
      ...config,
      windows: [
        { weekday: 2, start: "08:00", end: "12:00" },
        { weekday: 2, start: "11:00", end: "13:00" },
      ],
    }).success,
  );
  const saved = await updateAdvisorSchedule(seller, seller.id, config);
  check("el vendedor guarda su horario", !saved.usesDefault && saved.windows.length === 3);

  const own = await getVisitAvailability({ clientId: client.id, desde: monday, dias: 5 });
  check(
    "el agente solo ve martes y jueves",
    own.dias.map((day) => day.fecha).slice(0, 4).join(",") ===
      [tuesday, addDays(monday, 3), addDays(monday, 8), addDays(monday, 10)].join(","),
    own.dias.map((day) => day.fecha),
  );
  const tuesdaySlots = own.dias[0].franjas.map((slot) => slot.hora);
  check(
    "martes: 8:00–11:00 y 2:00–4:00 p. m., visitas de 60 min",
    tuesdaySlots.join(",") ===
      "8:00 a. m.,8:30 a. m.,9:00 a. m.,9:30 a. m.,10:00 a. m.,10:30 a. m.,11:00 a. m.,2:00 p. m.,2:30 p. m.,3:00 p. m.,3:30 p. m.,4:00 p. m.",
    tuesdaySlots,
  );
  check(
    "describe el horario propio",
    own.horario ===
      "martes, de 8:00 a. m. a 12:00 p. m. y de 2:00 p. m. a 5:00 p. m.; jueves, de 8:00 a. m. a 12:00 p. m. (hora de Bogotá)" &&
      own.duracionMinutos === 60,
    own.horario,
  );

  // ── Agendar ────────────────────────────────────────────────
  console.log("\nAgendar con el horario propio");
  const visit = (fecha: string) =>
    visitSchema.parse({ clientId: client.id, fecha, direccion: "Cra 7 # 45-10" });

  check(
    "rechaza un lunes (fuera de su horario, aunque esté en el general)",
    (await outcome(() => scheduleVisit(agent, visit(`${monday}T10:00:00-05:00`)))) === "BusinessRuleError",
  );
  check(
    "rechaza una visita que no cabe en la franja (11:30 + 60 min)",
    (await outcome(() => scheduleVisit(agent, visit(`${tuesday}T11:30:00-05:00`)))) === "BusinessRuleError",
  );
  const booked = await outcome(() => scheduleVisit(agent, visit(`${tuesday}T09:00:00-05:00`)));
  check("acepta una franja ofrecida", booked === "ok", booked);
  check(
    "choca con su visita contando 60 min + 30 de traslado",
    (await outcome(() => scheduleVisit(agent, visit(`${tuesday}T10:00:00-05:00`)))) === "BusinessRuleError",
  );
  const afterBooking = await getVisitAvailability({ clientId: client.id, desde: tuesday, dias: 1 });
  const free = allSlots(afterBooking);
  check(
    "la disponibilidad descuenta la visita y su traslado",
    !free.includes(`${tuesday}T08:00:00-05:00`) &&
      !free.includes(`${tuesday}T10:00:00-05:00`) &&
      free.includes(`${tuesday}T10:30:00-05:00`),
    free,
  );

  // ── Ausencias ──────────────────────────────────────────────
  console.log("\nAusencias");
  const thursday = addDays(monday, 3);
  const block = await createBlock(seller, seller.id, {
    fromDate: thursday,
    toDate: thursday,
    startTime: 0,
    endTime: 24 * 60,
    reason: `${TAG} capacitación`,
  });
  const withBlock = await getVisitAvailability({ clientId: client.id, desde: thursday, dias: 1 });
  check("un día de ausencia no ofrece franjas", allSlots(withBlock).length === 0, withBlock.dias);
  check(
    "y no se puede agendar en él",
    (await outcome(() => scheduleVisit(agent, visit(`${thursday}T09:00:00-05:00`)))) === "BusinessRuleError",
  );
  check(
    "otro vendedor no borra ausencias ajenas",
    (await outcome(() => deleteBlock(other, block.id))) === "ForbiddenError",
  );
  await deleteBlock(seller, block.id);
  check(
    "al quitarla vuelve a haber franjas",
    allSlots(await getVisitAvailability({ clientId: client.id, desde: thursday, dias: 1 })).length > 0,
  );

  // ── Interruptor ────────────────────────────────────────────
  console.log("\nInterruptor de visitas");
  await updateAdvisorSchedule(admin, seller.id, { ...config, acceptsVisits: false });
  const off = await getVisitAvailability({ clientId: client.id, desde: monday, dias: 5 });
  check("apagado, no ofrece franjas", off.recibeVisitas === false && off.dias.length === 0, off);
  check(
    "ni acepta visitas",
    (await outcome(() => scheduleVisit(agent, visit(`${thursday}T09:00:00-05:00`)))) ===
      "BusinessRuleError",
  );
  await updateAdvisorSchedule(admin, seller.id, { ...config, windows: [] });
  const backToDefault = await getVisitAvailability({ clientId: client.id, desde: monday, dias: 5 });
  check(
    "sin franjas vuelve al horario general",
    backToDefault.dias.length === 5 && backToDefault.duracionMinutos === 30,
    backToDefault.dias.length,
  );

  // ── API real del agente ────────────────────────────────────
  console.log("\nAPI del agente");
  const url = `http://localhost/api/agente/visitas/disponibilidad?clientId=${client.id}&desde=${monday}&dias=5`;
  const noKey = await availabilityRoute(new NextRequest(url));
  check("sin llave responde 401", noKey.status === 401);
  const withKey = await availabilityRoute(
    new NextRequest(url, { headers: { authorization: `Bearer ${API_KEY}` } }),
  );
  const body = await withKey.json();
  check(
    "con llave responde 200 con el contrato de siempre (+ recibeVisitas)",
    withKey.status === 200 &&
      typeof body.data.asesor === "string" &&
      typeof body.data.horario === "string" &&
      body.data.recibeVisitas === true &&
      Array.isArray(body.data.dias) &&
      typeof body.data.dias[0]?.franjas[0]?.inicio === "string",
    body,
  );

  // ── Pantalla de agenda ─────────────────────────────────────
  console.log("\nAgenda");
  const sellerAgenda = await listVisitAgenda(seller, { from: monday, days: 7, includeDone: false });
  check(
    "la visita agendada aparece en la agenda del vendedor",
    sellerAgenda.items.length === 1 && sellerAgenda.items[0].clientId === client.id,
    sellerAgenda.items.length,
  );
  const otherAgenda = await listVisitAgenda(other, {
    from: monday,
    days: 7,
    includeDone: false,
    userId: seller.id,
  });
  check("otro vendedor no ve agendas ajenas aunque lo pida", otherAgenda.items.length === 0);
  const adminAgenda = await listVisitAgenda(admin, {
    from: monday,
    days: 7,
    includeDone: false,
    userId: seller.id,
  });
  check("ADMIN ve la agenda de cualquiera", adminAgenda.items.length === 1);

  // ── Limpieza ───────────────────────────────────────────────
  await cleanup();
  if (agentCreated) await prisma.user.delete({ where: { id: agent.id } });

  console.log(fails === 0 ? "\nTodo en orden." : `\n${fails} comprobaciones fallaron.`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main()
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
