import { z } from "zod";
import { QuoteStatus } from "@/generated/prisma/enums";
import { localDateSchema } from "./reports";

export { endOfBusinessDay } from "./reports";

/** Consulta del tablero de pedidos. Un filtro vacío ("Todos") se trata como ausente. */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const orderBoardQuerySchema = z.object({
  search: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  /** Estado contable: el de la cotización. */
  accounting: z.preprocess(emptyToUndefined, z.enum([...Object.values(QuoteStatus), "SIN_COTIZACION"] as const).optional()),
  zone: z.preprocess(
    emptyToUndefined,
    z.enum(["NORTE_R1", "NORTE_R2", "SUR_R1", "SUR_R2", "CUNDINAMARCA", "NACIONAL"]).optional(),
  ),
  /** Día de entrega. */
  day: z.preprocess(emptyToUndefined, localDateSchema.optional()),
  view: z.preprocess(emptyToUndefined, z.enum(["lista", "pulpa", "zona"]).default("lista")),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type OrderBoardQuery = z.output<typeof orderBoardQuerySchema>;
