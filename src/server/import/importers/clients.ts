import {
  CLIENT_STATUS_LABEL,
  CLIENT_TYPE_LABEL,
  PAYMENT_TERMS_LABEL,
} from "@/lib/labels";
import { prisma } from "../../db";
import { ConflictError } from "../../errors";
import {
  addAddress,
  addContact,
  createClient,
  updateClient,
} from "../../services/clients";
import {
  addressCreateSchema,
  clientCreateSchema,
  clientUpdateSchema,
  type ClientCreateInput,
  contactCreateSchema,
} from "../../validators/clients";
import {
  findClient,
  loadClientIndex,
  loadPriceListIndex,
  loadUserIndex,
  loadZoneIndex,
  resolvePriceList,
  resolveUser,
  resolveZone,
  type ClientIndex,
  type ClientRef,
  type PriceListIndex,
  type UserIndex,
  type ZoneIndex,
} from "../context";
import {
  comparisonKey,
  compact,
  decimal,
  digits,
  enumValue,
  requiredText,
  text,
  type RowRecord,
} from "../helpers";
import type { Importer, ProcessOptions, RowResult } from "../runner";

/**
 * Carga masiva de clientes.
 *
 * Una fila puede traer, además del cliente, su sede de entrega y su contacto
 * principal: así es como vienen las listas de verdad — una línea por
 * negocio, con la dirección y el nombre de quien atiende en las mismas
 * columnas. Separarlo en tres archivos sería más ordenado en la teoría y más
 * trabajo en la práctica.
 *
 * Toda la escritura pasa por los servicios de `services/clients.ts`, no por
 * Prisma directo: así la carga masiva respeta las mismas reglas que el
 * formulario — cartera del vendedor, NIT único, dígito de verificación
 * calculado y sede principal excluyente.
 */

type Ctx = {
  clients: ClientIndex;
  users: UserIndex;
  priceLists: PriceListIndex;
  zones: ZoneIndex;
};

/**
 * Identidad de la fila.
 *
 * Manda el NIT cuando lo hay. Si no aparece ninguno, se busca por razón
 * social o nombre comercial, que es lo único que queda. El caso que sí se
 * rechaza es el peligroso: una fila con NIT cuyo nombre ya existe con **otro**
 * NIT — puede ser una sede nueva, un cambio de razón social o un error de
 * digitación, y ninguna de las tres se resuelve adivinando.
 */
function findExisting(
  ctx: Ctx,
  reference: { nit?: string; businessName: string; tradeName?: string },
): ClientRef | undefined {
  if (reference.nit) {
    const byNit = ctx.clients.byNit.get(reference.nit);
    if (byNit) return byNit;
  }

  const byName =
    findClient(ctx.clients, { name: reference.businessName }) ??
    (reference.tradeName
      ? findClient(ctx.clients, { name: reference.tradeName })
      : undefined);

  if (byName && reference.nit && byName.nit && byName.nit !== reference.nit) {
    throw new ConflictError(
      `Ya existe "${byName.businessName}" con el NIT ${byName.nit}, y esta fila trae ${reference.nit}. Revísalo a mano.`,
    );
  }

  return byName;
}

/** Datos de la sede que trae la fila, ya validados. Null si no trae ninguna. */
function readAddress(record: RowRecord, ctx: Ctx) {
  const address = text(record, "address");
  if (!address) return null;

  const zoneName = text(record, "zoneName");
  const zone = resolveZone(ctx.zones, zoneName);

  const input = addressCreateSchema.parse(
    compact({
      // Sin etiqueta en el archivo, el nombre lo pone el propio CRM.
      label: text(record, "addressLabel") ?? "Sede principal",
      address,
      neighborhood: text(record, "neighborhood"),
      city: text(record, "city"),
      zoneId: zone?.id,
      deliveryNotes: text(record, "deliveryNotes"),
    }),
  );

  return {
    input,
    /*
     * La zona que no cuadra no invalida la fila —se asigna al planear la
     * ruta—, pero callarlo sería peor: quien importa se enteraría el día que
     * la sede no aparece en ninguna ruta.
     */
    warning:
      zoneName && !zone
        ? `la zona "${zoneName}" no existe: la sede queda sin zona`
        : undefined,
  };
}

/** Datos del contacto que trae la fila. Null si no trae ninguno. */
function readContact(record: RowRecord) {
  const firstName = text(record, "contactFirstName");
  if (!firstName) return null;

  return contactCreateSchema.parse(
    compact({
      firstName,
      lastName: text(record, "contactLastName"),
      jobTitle: text(record, "contactJobTitle"),
      email: text(record, "contactEmail"),
      phone: text(record, "contactPhone"),
      whatsapp: text(record, "contactWhatsapp"),
    }),
  );
}

export const clientsImporter: Importer<Ctx> = {
  async load() {
    const [clients, users, priceLists, zones] = await Promise.all([
      loadClientIndex(),
      loadUserIndex(),
      loadPriceListIndex(),
      loadZoneIndex(),
    ]);

    return { clients, users, priceLists, zones };
  },

  async process(
    record: RowRecord,
    ctx: Ctx,
    options: ProcessOptions,
  ): Promise<RowResult> {
    const businessName = requiredText(record, "businessName", "Razón social");
    const tradeName = text(record, "tradeName");
    const nit = digits(text(record, "nit"));
    const label = tradeName ?? businessName;

    const existing = findExisting(ctx, { nit, businessName, tradeName });

    if (existing && options.mode === "crear") {
      return { action: "omitir", label, message: "Ya está registrado." };
    }
    if (!existing && options.mode === "actualizar") {
      return { action: "omitir", label, message: "Todavía no está registrado." };
    }

    const owner = resolveUser(ctx.users, text(record, "ownerRef"));
    const priceListName = text(record, "priceListName");
    const priceList = priceListName
      ? resolvePriceList(ctx.priceLists, priceListName)
      : undefined;

    const payload = {
      businessName,
      tradeName,
      nit,
      nitDv: text(record, "nitDv"),
      type: enumValue(record, "type", CLIENT_TYPE_LABEL, "Tipo de cliente"),
      status: enumValue(record, "status", CLIENT_STATUS_LABEL, "Estado"),
      email: text(record, "email"),
      phone: text(record, "phone"),
      paymentTerms: enumValue(
        record,
        "paymentTerms",
        PAYMENT_TERMS_LABEL,
        "Condición de pago",
      ),
      creditLimit: decimal(record, "creditLimit", "Cupo de crédito"),
      ownerId: owner?.id,
      priceListId: priceList?.id,
      notes: text(record, "notes"),
    };

    // Se valida siempre, también en simulación: es el sentido de la vista
    // previa — que los errores aparezcan antes de escribir nada.
    const input = existing
      ? clientUpdateSchema.parse(compact(payload))
      : clientCreateSchema.parse(compact(payload));

    const addressRow = readAddress(record, ctx);
    const contactInput = readContact(record);

    const extras: string[] = [];
    if (addressRow) extras.push("sede");
    if (contactInput) extras.push("contacto");

    const summary = [
      extras.length > 0 ? `Incluye ${extras.join(" y ")}.` : undefined,
      addressRow?.warning,
    ]
      .filter(Boolean)
      .join(" · ");

    if (options.dryRun) {
      // Se recuerda el nombre para que dos filas del mismo archivo sobre el
      // mismo cliente no se cuenten las dos como altas nuevas.
      if (!existing) {
        ctx.clients.remember(
          { id: "", nit: nit ?? null, businessName, ownerId: null },
          [tradeName],
        );
      }

      return {
        action: existing ? "actualizar" : "crear",
        label,
        message: summary || undefined,
      };
    }

    const client = existing
      ? await updateClient(options.user, existing.id, input)
      : await createClient(options.user, input as ClientCreateInput);

    if (!existing) {
      ctx.clients.remember(
        {
          id: client.id,
          nit: client.nit,
          businessName: client.businessName,
          ownerId: client.ownerId,
        },
        [client.tradeName],
      );
    }

    const done: string[] = [];

    if (addressRow) {
      done.push(await saveAddress(options, client.id, addressRow.input));
      if (addressRow.warning) done.push(addressRow.warning);
    }
    if (contactInput) {
      done.push(await saveContact(options, client.id, contactInput));
    }

    return {
      action: existing ? "actualizar" : "crear",
      label,
      message: done.length > 0 ? done.join(" · ") : undefined,
    };
  },
};

/**
 * Añade la sede si el cliente no la tiene ya. La comparación es por texto
 * normalizado de la dirección: reimportar el mismo archivo no debe llenar al
 * cliente de sedes repetidas.
 */
async function saveAddress(
  options: ProcessOptions,
  clientId: string,
  input: ReturnType<typeof addressCreateSchema.parse>,
): Promise<string> {
  const current = await prisma.clientAddress.findMany({
    where: { clientId, active: true },
    select: { address: true },
  });

  const already = current.some(
    (row) => comparisonKey(row.address) === comparisonKey(input.address),
  );
  if (already) return "sede ya registrada";

  await addAddress(options.user, clientId, {
    ...input,
    // La primera sede es la principal; el servicio lo impone de todos modos.
    isPrimary: current.length === 0,
  });

  return "sede creada";
}

/** Añade el contacto si no hay ya uno con el mismo nombre. */
async function saveContact(
  options: ProcessOptions,
  clientId: string,
  input: ReturnType<typeof contactCreateSchema.parse>,
): Promise<string> {
  const current = await prisma.contact.findMany({
    where: { clientId, active: true },
    select: { firstName: true, lastName: true },
  });

  const fullName = comparisonKey(`${input.firstName} ${input.lastName ?? ""}`);
  const already = current.some(
    (row) => comparisonKey(`${row.firstName} ${row.lastName ?? ""}`) === fullName,
  );
  if (already) return "contacto ya registrado";

  await addContact(options.user, clientId, {
    ...input,
    isPrimary: current.length === 0,
  });

  return "contacto creado";
}
