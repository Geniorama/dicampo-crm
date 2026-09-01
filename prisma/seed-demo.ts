import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { UserRole } from "../src/generated/prisma/enums";

/**
 * Datos de DEMOSTRACIÓN para revisar la aplicación con contenido realista.
 *
 * ⚠️ NO ejecutar en producción. Todo lo que crea lleva el prefijo `DEMO-` en
 * `Client.notes` y en los códigos de lote, de modo que `npm run db:demo:clean`
 * puede borrarlo sin tocar los datos reales.
 *
 * Es idempotente: vuelve a empezar limpiando lo anterior.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const DEMO_TAG = "DEMO-";
const DEMO_PASSWORD = "dicampo2026";

const DEMO_USERS = [
  { email: "vendedor@dicampo.co", name: "Carolina Ríos", role: UserRole.VENDEDOR },
  { email: "bodega@dicampo.co", name: "Jorge Medina", role: UserRole.BODEGA },
  { email: "despacho@dicampo.co", name: "Luis Ardila", role: UserRole.DESPACHO },
];

const DEMO_CLIENTS = [
  {
    businessName: "Inversiones Gastronómicas del Norte S.A.S.",
    tradeName: "Restaurante La Cosecha",
    nit: "900456789",
    type: "RESTAURANTE",
    status: "ACTIVO",
    paymentTerms: "CREDITO_15",
    creditLimit: 2_000_000,
    zone: "Norte",
    address: { label: "Sede Usaquén", address: "Carrera 7 # 117-25", neighborhood: "Usaquén" },
    contact: { firstName: "Marcela", lastName: "Ospina", jobTitle: "Chef ejecutiva", whatsapp: "3105551122" },
  },
  {
    businessName: "Frutería El Paraíso Ltda.",
    tradeName: "Frutería El Paraíso",
    nit: "830112233",
    type: "FRUTERIA",
    status: "ACTIVO",
    paymentTerms: "CONTADO",
    creditLimit: 0,
    zone: "Chapinero",
    address: { label: "Local Chapinero", address: "Calle 60 # 9-40", neighborhood: "Chapinero Central" },
    contact: { firstName: "Hernán", lastName: "Castaño", jobTitle: "Propietario", whatsapp: "3208887744" },
  },
  {
    businessName: "Panadería y Pastelería Trigo de Oro S.A.S.",
    tradeName: "Trigo de Oro",
    nit: "901334455",
    type: "PANADERIA",
    status: "ACTIVO",
    paymentTerms: "CREDITO_30",
    creditLimit: 3_500_000,
    zone: "Occidente",
    address: { label: "Planta Fontibón", address: "Calle 17 # 96-30", neighborhood: "Fontibón" },
    contact: { firstName: "Diana", lastName: "Pulido", jobTitle: "Jefe de compras", whatsapp: "3112223344" },
  },
  {
    businessName: "Comidas Rápidas Antojos Express S.A.S.",
    tradeName: "Antojos Express",
    nit: "901667788",
    type: "COMIDAS_RAPIDAS",
    status: "ACTIVO",
    paymentTerms: "CONTADO",
    creditLimit: 0,
    zone: "Sur",
    address: { label: "Punto Bosa", address: "Carrera 80 # 61-15 Sur", neighborhood: "Bosa Centro" },
    contact: { firstName: "Wilson", lastName: "Peña", jobTitle: "Administrador", whatsapp: "3159996655" },
  },
  {
    businessName: "Café Literario del Centro S.A.S.",
    tradeName: "Café Literario",
    nit: "900998877",
    type: "CAFETERIA",
    status: "PROSPECTO",
    paymentTerms: "CONTADO",
    creditLimit: 0,
    zone: "Centro",
    address: { label: "La Candelaria", address: "Calle 12B # 2-58", neighborhood: "La Candelaria" },
    contact: { firstName: "Valentina", lastName: "Rojas", jobTitle: "Administradora", whatsapp: "3181114455" },
  },
  {
    businessName: "Distribuidora de Alimentos Sabana Ltda.",
    tradeName: "Distri Sabana",
    nit: "830554433",
    type: "DISTRIBUIDOR",
    status: "SUSPENDIDO",
    paymentTerms: "CREDITO_30",
    creditLimit: 5_000_000,
    zone: "Municipios aledaños",
    address: { label: "Bodega Funza", address: "Km 3 vía Siberia-Funza", neighborhood: "Zona Industrial" },
    contact: { firstName: "Ricardo", lastName: "Beltrán", jobTitle: "Gerente", whatsapp: "3134447788" },
  },
] as const;

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);

/** Calcula el DV del NIT (algoritmo DIAN), igual que src/lib/nit.ts. */
const DV_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
function nitDv(nit: string): string {
  let sum = 0;
  for (let i = 0; i < nit.length; i += 1) {
    sum += Number(nit[nit.length - 1 - i]) * DV_WEIGHTS[i];
  }
  const rest = sum % 11;
  return String(rest > 1 ? 11 - rest : rest);
}

async function clean() {
  const demoClients = await prisma.client.findMany({
    where: { notes: { startsWith: DEMO_TAG } },
    select: { id: true },
  });
  const clientIds = demoClients.map((c) => c.id);

  if (clientIds.length > 0) {
    await prisma.stockMovement.deleteMany({
      where: { order: { clientId: { in: clientIds } } },
    });
    await prisma.activity.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.opportunity.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.orderItem.deleteMany({
      where: { order: { clientId: { in: clientIds } } },
    });
    await prisma.order.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  }

  await prisma.stockMovement.deleteMany({
    where: { lot: { lotCode: { startsWith: DEMO_TAG } } },
  });
  await prisma.lot.deleteMany({ where: { lotCode: { startsWith: DEMO_TAG } } });

  return clientIds.length;
}

async function main() {
  const shouldOnlyClean = process.argv.includes("--clean");

  const removed = await clean();
  if (shouldOnlyClean) {
    console.log(`Datos de demostración eliminados (${removed} clientes).`);
    return;
  }

  console.log("Cargando datos de demostración…\n");

  // ── Usuarios de prueba ─────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const demoUser of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: demoUser.email },
      update: { role: demoUser.role, active: true, passwordHash },
      create: { ...demoUser, passwordHash },
    });
  }
  console.log(`  Usuarios de prueba: ${DEMO_USERS.length}`);

  const seller = await prisma.user.findUniqueOrThrow({
    where: { email: "vendedor@dicampo.co" },
  });
  const warehouse = await prisma.user.findUniqueOrThrow({
    where: { email: "bodega@dicampo.co" },
  });
  const priceList = await prisma.priceList.findFirstOrThrow({
    where: { isDefault: true },
  });
  const zones = await prisma.deliveryZone.findMany();
  const zoneByName = new Map(zones.map((z) => [z.name, z.id]));

  // ── Clientes con contacto y sede ───────────────────────────
  const createdClients = [];
  for (const demo of DEMO_CLIENTS) {
    const client = await prisma.client.create({
      data: {
        businessName: demo.businessName,
        tradeName: demo.tradeName,
        nit: demo.nit,
        nitDv: nitDv(demo.nit),
        type: demo.type,
        status: demo.status,
        paymentTerms: demo.paymentTerms,
        creditLimit: demo.creditLimit,
        ownerId: seller.id,
        priceListId: priceList.id,
        notes: `${DEMO_TAG}cliente de demostración`,
        contacts: { create: { ...demo.contact, isPrimary: true } },
        addresses: {
          create: {
            ...demo.address,
            city: "Bogotá",
            isPrimary: true,
            zoneId: zoneByName.get(demo.zone),
          },
        },
      },
      include: { addresses: true },
    });
    createdClients.push(client);
  }
  console.log(`  Clientes: ${createdClients.length}`);

  // ── Lotes de inventario, con vencimientos escalonados ──────
  const variants = await prisma.productVariant.findMany({
    where: { active: true },
    include: { product: true },
    orderBy: { sku: "asc" },
  });

  let lotCount = 0;
  for (const [index, variant] of variants.entries()) {
    // Un lote por variante; uno de cada cinco vence pronto, para que se vea
    // funcionando la alerta de vencimiento.
    const expiresSoon = index % 5 === 0;
    await prisma.lot.create({
      data: {
        variantId: variant.id,
        lotCode: `${DEMO_TAG}L${String(index + 1).padStart(3, "0")}`,
        productionDate: daysFromNow(-60),
        expiryDate: daysFromNow(expiresSoon ? 12 : 150),
        quantityInitial: 120,
        quantityAvailable: 120,
        movements: {
          create: {
            type: "ENTRADA_PRODUCCION",
            variantId: variant.id,
            quantity: 120,
            userId: warehouse.id,
            reason: "Entrada de producción (demo)",
          },
        },
      },
    });
    lotCount += 1;
  }
  console.log(`  Lotes: ${lotCount} (${Math.ceil(lotCount / 5)} próximos a vencer)`);

  // ── Pedidos en distintos estados ───────────────────────────
  const prices = await prisma.priceListItem.findMany({
    where: { priceListId: priceList.id },
  });
  const priceByVariant = new Map(prices.map((p) => [p.variantId, Number(p.price)]));

  const activeClients = createdClients.filter((c) => c.status === "ACTIVO");
  const orderPlans = [
    { status: "BORRADOR", daysAgo: 0, channel: "WHATSAPP" },
    { status: "CONFIRMADO", daysAgo: 1, channel: "WHATSAPP" },
    { status: "EN_PREPARACION", daysAgo: 2, channel: "TELEFONO" },
    { status: "DESPACHADO", daysAgo: 3, channel: "WHATSAPP" },
    { status: "ENTREGADO", daysAgo: 8, channel: "VISITA" },
    { status: "ENTREGADO", daysAgo: 15, channel: "WHATSAPP" },
    { status: "CANCELADO", daysAgo: 5, channel: "TELEFONO" },
  ] as const;

  let orderCount = 0;
  for (const [index, plan] of orderPlans.entries()) {
    const client = activeClients[index % activeClients.length];
    // Dos o tres líneas por pedido, rotando el catálogo.
    const chosen = [
      variants[index % variants.length],
      variants[(index + 3) % variants.length],
      ...(index % 2 === 0 ? [variants[(index + 7) % variants.length]] : []),
    ];

    const items = chosen.map((variant, line) => {
      const unitPrice = priceByVariant.get(variant.id) ?? 12_000;
      const quantity = 5 + line * 3;
      return {
        variantId: variant.id,
        productNameSnapshot: variant.product.name,
        skuSnapshot: variant.sku,
        presentationSnapshot: variant.presentation,
        quantity,
        unitPrice,
        discount: 0,
        taxRate: Number(variant.product.taxRate),
        subtotal: unitPrice * quantity,
      };
    });

    const subtotal = items.reduce((acc, item) => acc + item.subtotal, 0);
    const orderDate = daysFromNow(-plan.daysAgo);
    const stockApplied = ["CONFIRMADO", "EN_PREPARACION", "DESPACHADO", "ENTREGADO"].includes(
      plan.status,
    );

    await prisma.order.create({
      data: {
        clientId: client.id,
        addressId: client.addresses[0]?.id,
        sellerId: seller.id,
        status: plan.status,
        channel: plan.channel,
        orderDate,
        requestedDeliveryDate: daysFromNow(-plan.daysAgo + 2),
        paymentTerms: client.paymentTerms,
        paymentStatus: plan.status === "ENTREGADO" ? "PAGADO" : "PENDIENTE",
        subtotal,
        discount: 0,
        tax: 0,
        total: subtotal,
        // Coherente con el estado: solo los que pasaron por confirmación
        // tienen inventario aplicado.
        stockAppliedAt: stockApplied ? orderDate : null,
        confirmedAt: stockApplied ? orderDate : null,
        deliveredAt: plan.status === "ENTREGADO" ? daysFromNow(-plan.daysAgo + 2) : null,
        cancelledAt: plan.status === "CANCELADO" ? orderDate : null,
        cancelReason:
          plan.status === "CANCELADO" ? "El cliente reprogramó la entrega" : null,
        items: { create: items },
      },
    });
    orderCount += 1;
  }
  console.log(`  Pedidos: ${orderCount} (uno por cada estado del ciclo)`);


  // ── Oportunidades del pipeline ─────────────────────────────
  const opportunityPlans = [
    { stage: 'PROSPECTO', title: 'Suministro semanal para 2 sedes', value: 1_800_000, closeInDays: 30 },
    { stage: 'CONTACTADO', title: 'Cambio de proveedor de pulpa', value: 2_400_000, closeInDays: 21 },
    { stage: 'MUESTRA_ENVIADA', title: 'Prueba de limonadas saborizadas', value: 950_000, closeInDays: 14 },
    { stage: 'MUESTRA_ENVIADA', title: 'Línea de smoothies para desayunos', value: 1_200_000, closeInDays: 18 },
    { stage: 'NEGOCIACION', title: 'Contrato mensual con descuento por volumen', value: 4_500_000, closeInDays: 7 },
    { stage: 'GANADA', title: 'Apertura de cuenta corporativa', value: 3_000_000, closeInDays: -10 },
    { stage: 'PERDIDA', title: 'Suministro para evento corporativo', value: 800_000, closeInDays: -5 },
  ] as const;

  for (const [index, plan] of opportunityPlans.entries()) {
    const client = createdClients[index % createdClients.length];
    const closed = plan.stage === 'GANADA' || plan.stage === 'PERDIDA';

    await prisma.opportunity.create({
      data: {
        clientId: client.id,
        ownerId: seller.id,
        title: plan.title,
        stage: plan.stage,
        estimatedValue: plan.value,
        expectedCloseDate: daysFromNow(plan.closeInDays),
        closedAt: closed ? daysFromNow(plan.closeInDays) : null,
        lostReason:
          plan.stage === 'PERDIDA' ? 'El cliente eligió un proveedor más económico' : null,
        notes: `${DEMO_TAG}oportunidad de demostración`,
      },
    });
  }
  console.log(`  Oportunidades: ${opportunityPlans.length}`);

  // ── Actividades ────────────────────────────────────────────
  const activities = [
    { type: "LLAMADA", subject: "Llamada de seguimiento post-entrega", daysAgo: 1 },
    { type: "WHATSAPP", subject: "Envío de lista de precios actualizada", daysAgo: 2 },
    { type: "VISITA", subject: "Visita comercial y degustación", daysAgo: 4 },
    { type: "MUESTRA", subject: "Entrega de muestra de maracuyá", daysAgo: 6 },
  ] as const;

  for (const [index, activity] of activities.entries()) {
    await prisma.activity.create({
      data: {
        type: activity.type,
        subject: activity.subject,
        clientId: createdClients[index % createdClients.length].id,
        userId: seller.id,
        completedAt: daysFromNow(-activity.daysAgo),
        createdAt: daysFromNow(-activity.daysAgo),
      },
    });
  }
  console.log(`  Actividades: ${activities.length}`);

  console.log(`
Usuarios de prueba (contraseña: ${DEMO_PASSWORD})
  vendedor@dicampo.co   VENDEDOR  — solo ve su propia cartera
  bodega@dicampo.co     BODEGA    — inventario
  despacho@dicampo.co   DESPACHO  — rutas

Para borrarlo todo: npm run db:demo:clean
`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Falló la carga de demostración:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
