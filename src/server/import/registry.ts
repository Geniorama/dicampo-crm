import type { UserRole } from "@/generated/prisma/enums";
import {
  IMPORT_ENTITIES,
  type ImportEntity,
  type ImportEntityKey,
} from "@/lib/import/entities";
import type { ColumnMapping, ImportReport } from "@/lib/import/types";
import { INVENTORY_ROLES, SALES_ROLES } from "../guards";
import { addressesImporter } from "./importers/addresses";
import { clientsImporter } from "./importers/clients";
import { contactsImporter } from "./importers/contacts";
import { lotsImporter } from "./importers/lots";
import { opportunitiesImporter } from "./importers/opportunities";
import { pricesImporter } from "./importers/prices";
import { productsImporter } from "./importers/products";
import { runImport, type Importer, type ProcessOptions } from "./runner";

/**
 * Registro de importadores: une la descripción de cada entidad con el código
 * que la ejecuta y con quién puede ejecutarla.
 *
 * Los permisos son los mismos del módulo al que pertenece cada carga, y por
 * la misma razón: el catálogo es decisión comercial, así que solo ADMIN sube
 * precios; el inventario lo lleva bodega; la cartera, ventas. Una puerta
 * trasera por la que cualquiera pudiera subir una lista de precios haría
 * inútil el candado de la puerta principal.
 */

/** Roles admitidos, o `"admin"` cuando la carga es solo de administración. */
export type ImportAccess = readonly UserRole[] | "admin";

export type ImportRunParams = {
  rows: readonly (readonly string[])[];
  mapping: ColumnMapping;
  options: ProcessOptions;
};

export type ImportRegistryEntry = {
  entity: ImportEntity;
  access: ImportAccess;
  run(params: ImportRunParams): Promise<ImportReport>;
};

/**
 * Cierra el genérico del importador sobre su propio contexto. Sin esto, el
 * registro tendría que declararse con un `any` que apagaría la comprobación
 * de tipos justo donde más falta hace.
 */
function entry<Ctx>(
  entity: ImportEntity,
  access: ImportAccess,
  importer: Importer<Ctx>,
): ImportRegistryEntry {
  return {
    entity,
    access,
    run: ({ rows, mapping, options }) =>
      runImport(importer, {
        entity: entity.key,
        fields: entity.fields,
        rows,
        mapping,
        options,
      }),
  };
}

export const IMPORT_REGISTRY: Record<ImportEntityKey, ImportRegistryEntry> = {
  clientes: entry(IMPORT_ENTITIES.clientes, SALES_ROLES, clientsImporter),
  contactos: entry(IMPORT_ENTITIES.contactos, SALES_ROLES, contactsImporter),
  sedes: entry(IMPORT_ENTITIES.sedes, SALES_ROLES, addressesImporter),
  productos: entry(IMPORT_ENTITIES.productos, "admin", productsImporter),
  precios: entry(IMPORT_ENTITIES.precios, "admin", pricesImporter),
  lotes: entry(IMPORT_ENTITIES.lotes, INVENTORY_ROLES, lotsImporter),
  oportunidades: entry(
    IMPORT_ENTITIES.oportunidades,
    SALES_ROLES,
    opportunitiesImporter,
  ),
};

export function importAccess(key: ImportEntityKey): ImportAccess {
  return IMPORT_REGISTRY[key].access;
}
