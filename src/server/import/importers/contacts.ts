import { DOC_TYPE_LABEL } from "@/lib/labels";
import { prisma } from "../../db";
import { addContact, updateContact } from "../../services/clients";
import {
  contactCreateSchema,
  contactUpdateSchema,
  type ContactCreateInput,
} from "../../validators/clients";
import {
  loadClientIndex,
  requireClient,
  type ClientIndex,
} from "../context";
import {
  boolean,
  comparisonKey,
  compact,
  digits,
  enumValue,
  requiredText,
  text,
  type RowRecord,
} from "../helpers";
import type { Importer, ProcessOptions, RowResult } from "../runner";

/**
 * Carga masiva de contactos.
 *
 * Existe aparte del importador de clientes porque un cliente puede tener
 * varios interlocutores —el chef, la administradora, quien paga— y eso no
 * cabe en una fila por cliente.
 */

type Ctx = { clients: ClientIndex };

export const contactsImporter: Importer<Ctx> = {
  async load() {
    return { clients: await loadClientIndex() };
  },

  async process(
    record: RowRecord,
    ctx: Ctx,
    options: ProcessOptions,
  ): Promise<RowResult> {
    const client = requireClient(ctx.clients, {
      nit: digits(text(record, "clientNit")),
      name: text(record, "clientName"),
    });

    const firstName = requiredText(record, "firstName", "Nombre");
    const lastName = text(record, "lastName");
    const label = `${firstName} ${lastName ?? ""}`.trim();

    // La agenda de un cliente es corta: se trae entera y se compara aquí,
    // que además permite ignorar mayúsculas y acentos.
    const current = await prisma.contact.findMany({
      where: { clientId: client.id, active: true },
      select: { id: true, firstName: true, lastName: true },
    });

    const key = comparisonKey(`${firstName} ${lastName ?? ""}`);
    const existing = current.find(
      (row) => comparisonKey(`${row.firstName} ${row.lastName ?? ""}`) === key,
    );

    if (existing && options.mode === "crear") {
      return {
        action: "omitir",
        label,
        message: `Ya está en la agenda de ${client.businessName}.`,
      };
    }
    if (!existing && options.mode === "actualizar") {
      return {
        action: "omitir",
        label,
        message: `Todavía no está en la agenda de ${client.businessName}.`,
      };
    }

    const payload = {
      firstName,
      lastName,
      jobTitle: text(record, "jobTitle"),
      email: text(record, "email"),
      phone: text(record, "phone"),
      whatsapp: text(record, "whatsapp"),
      docType: enumValue(record, "docType", DOC_TYPE_LABEL, "Tipo de documento"),
      docNumber: text(record, "docNumber"),
      isPrimary:
        boolean(record, "isPrimary", "¿Es el contacto principal?") ??
        // Sin columna que lo diga, el primer contacto del cliente manda.
        current.length === 0,
      notes: text(record, "notes"),
    };

    const input = existing
      ? contactUpdateSchema.parse(compact(payload))
      : contactCreateSchema.parse(compact(payload));

    if (!options.dryRun) {
      if (existing) {
        await updateContact(options.user, existing.id, input);
      } else {
        await addContact(options.user, client.id, input as ContactCreateInput);
      }
    }

    return {
      action: existing ? "actualizar" : "crear",
      label,
      message: client.businessName,
    };
  },
};
