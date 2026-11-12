import { z } from "zod";
import { ClientRelationStatus } from "@/generated/prisma/enums";

/** Filtros de "Mis clientes". Todos viajan por la URL. */
export const myClientsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  /** Estado comercial de la base (activo / por recuperar / en alerta). */
  relationStatus: z.enum(ClientRelationStatus).optional(),
  locality: z.string().trim().max(100).optional(),
  zoneId: z.string().cuid().optional(),
  /** Día en que se contacta al cliente para tomar el pedido ("Lunes"…). */
  orderDay: z.string().trim().max(20).optional(),
  deliveryDay: z.string().trim().max(20).optional(),
  /** Mes del último pedido, "AAAA-MM". */
  lastOrderMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes no válido")
    .optional(),
  /** Solo para ADMIN: ver la cartera de un asesor. */
  ownerId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type MyClientsQuery = z.infer<typeof myClientsQuerySchema>;
