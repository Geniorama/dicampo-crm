import { z } from "zod";
import { UserRole } from "@/generated/prisma/enums";
import { isAssignableRole } from "@/lib/agent";

/** Validación de usuarios internos y de cambios de contraseña. */

/** Rol que se puede dar a una persona: todos menos el del agente IA. */
const assignableRole = z
  .enum(UserRole)
  .refine(isAssignableRole, {
    message: "Ese rol es exclusivo del agente IA y no se asigna a personas.",
  });

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

/**
 * Política de contraseña.
 *
 * Longitud mínima razonable sin exigir símbolos: obligar a caracteres raros
 * empuja a la gente a apuntarlos en un papel junto al computador de bodega.
 * Lo que sí se rechaza son las contraseñas obvias.
 */
export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128)
  .refine((value) => !/^\s|\s$/.test(value), {
    message: "La contraseña no puede empezar ni terminar con espacios",
  })
  .refine(
    (value) =>
      !["12345678", "contrasena", "contraseña", "password", "dicampo1"].includes(
        value.toLowerCase(),
      ),
    { message: "Esa contraseña es demasiado común" },
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Correo no válido")
  .max(150);

export const userCreateSchema = z.object({
  name: z.string().trim().min(3, "El nombre es obligatorio").max(120),
  email: emailSchema,
  password: passwordSchema,
  role: assignableRole.default(UserRole.VENDEDOR),
  phone: optionalText(50),
});

export type UserFormValues = z.input<typeof userCreateSchema>;
export type UserCreateInput = z.output<typeof userCreateSchema>;

/**
 * La edición no toca la contraseña: se cambia por su propio endpoint, para no
 * arriesgar que un PATCH de perfil la reescriba sin querer.
 */
export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(3, "El nombre es obligatorio").max(120).optional(),
    role: assignableRole.optional(),
    phone: optionalText(50),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar.",
  });

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

/** Un ADMIN restablece la contraseña de otra persona: no le pide la anterior. */
export const passwordResetSchema = z.object({
  password: passwordSchema,
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

/** Cambio de la propia contraseña: exige la actual como prueba de identidad. */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
    password: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.password, {
    path: ["password"],
    message: "La nueva contraseña debe ser distinta de la actual",
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

export const userListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.enum(UserRole).optional(),
  /** "1" incluye también los usuarios desactivados. */
  includeInactive: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
