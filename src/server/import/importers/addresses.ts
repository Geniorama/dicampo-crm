import { prisma } from "../../db";
import { addAddress, updateAddress } from "../../services/clients";
import {
  addressCreateSchema,
  addressUpdateSchema,
  type AddressCreateInput,
} from "../../validators/clients";
import {
  loadClientIndex,
  loadZoneIndex,
  requireClient,
  resolveZone,
  type ClientIndex,
  type ZoneIndex,
} from "../context";
import {
  boolean,
  comparisonKey,
  compact,
  decimal,
  digits,
  requiredText,
  text,
  type RowRecord,
} from "../helpers";
import type { Importer, ProcessOptions, RowResult } from "../runner";

/**
 * Carga masiva de sedes de entrega.
 *
 * Una sede que no se reconoce por zona entra igual, solo que sin zona: perder
 * la dirección porque el barrio no coincide con ninguna zona configurada
 * sería peor que asignarla luego al planear la ruta.
 */

type Ctx = { clients: ClientIndex; zones: ZoneIndex };

export const addressesImporter: Importer<Ctx> = {
  async load() {
    const [clients, zones] = await Promise.all([
      loadClientIndex(),
      loadZoneIndex(),
    ]);

    return { clients, zones };
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

    const address = requiredText(record, "address", "Dirección");
    const label = requiredText(record, "label", "Nombre de la sede");

    const current = await prisma.clientAddress.findMany({
      where: { clientId: client.id, active: true },
      select: { id: true, address: true },
    });

    const existing = current.find(
      (row) => comparisonKey(row.address) === comparisonKey(address),
    );

    if (existing && options.mode === "crear") {
      return {
        action: "omitir",
        label,
        message: `${client.businessName} ya tiene esa dirección.`,
      };
    }
    if (!existing && options.mode === "actualizar") {
      return {
        action: "omitir",
        label,
        message: `${client.businessName} no tiene esa dirección registrada.`,
      };
    }

    const zoneName = text(record, "zoneName");
    const zone = resolveZone(ctx.zones, zoneName);

    const payload = {
      label,
      address,
      neighborhood: text(record, "neighborhood"),
      city: text(record, "city"),
      zoneId: zone?.id,
      lat: decimal(record, "lat", "Latitud"),
      lng: decimal(record, "lng", "Longitud"),
      deliveryNotes: text(record, "deliveryNotes"),
      isPrimary:
        boolean(record, "isPrimary", "¿Es la sede principal?") ??
        current.length === 0,
    };

    const input = existing
      ? addressUpdateSchema.parse(compact(payload))
      : addressCreateSchema.parse(compact(payload));

    if (!options.dryRun) {
      if (existing) {
        await updateAddress(options.user, existing.id, input);
      } else {
        await addAddress(options.user, client.id, input as AddressCreateInput);
      }
    }

    const notes = [client.businessName];
    if (zoneName && !zone) {
      notes.push(`la zona "${zoneName}" no existe: la sede queda sin zona`);
    }

    return {
      action: existing ? "actualizar" : "crear",
      label,
      message: notes.join(" · "),
    };
  },
};
