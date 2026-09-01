import { z } from "zod";
import {
  ClientStatus,
  ClientType,
  DocType,
  PaymentTerms,
} from "@/generated/prisma/enums";
import { calculateNitDv, onlyDigits } from "@/lib/nit";

/**
 * Validación de clientes, contactos y sedes.
 *
 * Estos esquemas se comparten entre la API (`src/app/api/clientes`) y los
 * formularios del cliente, para que la regla se escriba una sola vez.
 */

/** Convierte "" en undefined: los inputs vacíos del navegador no son datos. */
const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

const nitSchema = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine((value) => value.length >= 5 && value.length <= 15, {
    message: "El NIT debe tener entre 5 y 15 dígitos",
  });

/** Campos del cliente, sin reglas cruzadas: es la base de crear y editar. */
const clientBaseSchema = z
  .object({
    businessName: z
      .string()
      .trim()
      .min(3, "La razón social es obligatoria")
      .max(200),
    tradeName: optionalText(200),
    nit: nitSchema.optional(),
    nitDv: z.string().trim().regex(/^\d$/, "El DV es un solo dígito").optional(),
    type: z.enum(ClientType).default(ClientType.OTRO),
    status: z.enum(ClientStatus).default(ClientStatus.PROSPECTO),
    email: z.string().trim().email("Correo no válido").optional().or(z.literal("").transform(() => undefined)),
    phone: optionalText(50),
    ownerId: z.string().cuid().optional(),
    priceListId: z.string().cuid().optional(),
    paymentTerms: z.enum(PaymentTerms).default(PaymentTerms.CONTADO),
    creditLimit: z.coerce.number().min(0, "El cupo no puede ser negativo").default(0),
    notes: optionalText(2000),
  });

export const clientCreateSchema = clientBaseSchema.superRefine((data, ctx) => {
    // Si viene NIT y DV, deben ser coherentes según el algoritmo de la DIAN.
    if (data.nit && data.nitDv) {
      const expected = calculateNitDv(data.nit);
      if (expected !== data.nitDv) {
        ctx.addIssue({
          code: "custom",
          path: ["nitDv"],
          message: `El dígito de verificación no corresponde al NIT (debería ser ${expected}).`,
        });
      }
    }

    // Un cliente ACTIVO debe tener con quién facturarse.
    if (data.status === ClientStatus.ACTIVO && !data.nit) {
      ctx.addIssue({
        code: "custom",
        path: ["nit"],
        message: "Un cliente activo necesita NIT para poder facturarle.",
      });
    }
  });

/** Lo que envía el formulario: los campos con `.default()` son opcionales. */
export type ClientFormValues = z.input<typeof clientCreateSchema>;

/** Lo que recibe el servicio tras validar: ya con los defaults aplicados. */
export type ClientCreateInput = z.output<typeof clientCreateSchema>;

/**
 * En la edición todos los campos son opcionales (PATCH parcial). Parte del
 * esquema base, no del de creación: las reglas cruzadas de arriba necesitan
 * el objeto completo y no aplican a una actualización parcial.
 */
export const clientUpdateSchema = clientBaseSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar.",
  });

export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

export const clientListQuerySchema = z.object({
  /** Busca en razón social, nombre comercial y NIT. */
  search: z.string().trim().max(120).optional(),
  status: z.enum(ClientStatus).optional(),
  type: z.enum(ClientType).optional(),
  ownerId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

// ── Contactos ────────────────────────────────────────────────

export const contactCreateSchema = z.object({
  firstName: z.string().trim().min(2, "El nombre es obligatorio").max(100),
  lastName: optionalText(100),
  jobTitle: optionalText(100),
  email: z.string().trim().email("Correo no válido").optional().or(z.literal("").transform(() => undefined)),
  phone: optionalText(50),
  whatsapp: optionalText(50),
  docType: z.enum(DocType).optional(),
  docNumber: optionalText(30),
  isPrimary: z.boolean().default(false),
  notes: optionalText(1000),
});

export type ContactFormValues = z.input<typeof contactCreateSchema>;
export type ContactCreateInput = z.output<typeof contactCreateSchema>;

export const contactUpdateSchema = contactCreateSchema.partial();
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;

// ── Sedes de entrega ─────────────────────────────────────────

export const addressCreateSchema = z.object({
  label: z.string().trim().min(2, "Ponle un nombre a la sede").max(100),
  address: z.string().trim().min(5, "La dirección es obligatoria").max(200),
  neighborhood: optionalText(100),
  city: z.string().trim().max(100).default("Bogotá"),
  zoneId: z.string().cuid().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  deliveryNotes: optionalText(1000),
  isPrimary: z.boolean().default(false),
});

export type AddressFormValues = z.input<typeof addressCreateSchema>;
export type AddressCreateInput = z.output<typeof addressCreateSchema>;

export const addressUpdateSchema = addressCreateSchema.partial();
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;
