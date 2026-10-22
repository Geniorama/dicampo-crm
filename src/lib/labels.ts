import type { BadgeTone } from "@/components/ui/badge";
import type {
  ActivityType,
  BillingMode,
  QuoteStatus,
  ClientStatus,
  ClientType,
  ConversationStatus,
  DisqualificationReason,
  MessageAuthor,
  MessageType,
  DocType,
  LotStatus,
  OpportunityStage,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
  Presentation,
  ProductCategory,
  RouteStatus,
  StockMovementType,
  UserRole,
} from "@/generated/prisma/enums";

/**
 * Traducción de los enums del esquema a texto para la interfaz, y el tono de
 * color con el que se muestran. Centralizarlo aquí evita que cada pantalla
 * invente su propia etiqueta para el mismo estado.
 */

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  BODEGA: "Bodega",
  DESPACHO: "Despacho",
  COMPRAS: "Compras",
  AGENTE_IA: "Agente IA",
};

export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  RESTAURANTE: "Restaurante",
  FRUTERIA: "Frutería",
  PANADERIA: "Panadería",
  COMIDAS_RAPIDAS: "Comidas rápidas",
  CAFETERIA: "Cafetería",
  HOTEL: "Hotel",
  DISTRIBUIDOR: "Distribuidor",
  OTRO: "Otro",
};

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  PROSPECTO: "Prospecto",
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
  SUSPENDIDO: "Suspendido",
};

export const CLIENT_STATUS_TONE: Record<ClientStatus, BadgeTone> = {
  PROSPECTO: "info",
  ACTIVO: "success",
  INACTIVO: "neutral",
  SUSPENDIDO: "danger",
};

export const PAYMENT_TERMS_LABEL: Record<PaymentTerms, string> = {
  CONTADO: "Contado",
  CREDITO_8: "Crédito 8 días",
  CREDITO_15: "Crédito 15 días",
  CREDITO_30: "Crédito 30 días",
};

/** Días de plazo por condición de pago; se usa para calcular vencimientos. */
export const PAYMENT_TERMS_DAYS: Record<PaymentTerms, number> = {
  CONTADO: 0,
  CREDITO_8: 8,
  CREDITO_15: 15,
  CREDITO_30: 30,
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  CC: "Cédula de ciudadanía",
  CE: "Cédula de extranjería",
  NIT: "NIT",
  PASAPORTE: "Pasaporte",
};

export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  PULPA: "Pulpa",
  LIMONADA: "Limonada",
  MEZCLA: "Mezcla",
  ZUMO: "Zumo",
};

export const PRESENTATION_LABEL: Record<Presentation, string> = {
  KILO: "Kilo",
  LIBRA: "Libra",
  MEDIO_LITRO: "Medio litro",
  LITRO: "Litro",
  TRES_LITROS: "Tres litros",
};

/** Abreviatura para tablas y remisiones. */
export const PRESENTATION_SHORT: Record<Presentation, string> = {
  KILO: "kg",
  LIBRA: "lb",
  MEDIO_LITRO: "½ L",
  LITRO: "L",
  TRES_LITROS: "3 L",
};

/**
 * Los nombres siguen el embudo del equipo comercial. Los valores del enum no
 * cambian (la API del agente de WhatsApp y los datos existentes dependen de
 * ellos): CONTACTADO es "Cita programada", MUESTRA_ENVIADA es "Visita /
 * capacitación realizada" y NEGOCIACION es "Pendiente / seguimiento".
 */
export const OPPORTUNITY_STAGE_LABEL: Record<OpportunityStage, string> = {
  PROSPECTO: "Sin cita",
  CONTACTADO: "Cita programada",
  MUESTRA_ENVIADA: "Visita / capacitación realizada",
  NEGOCIACION: "Pendiente / seguimiento",
  GANADA: "Cliente cerrado",
  PERDIDA: "Cliente perdido",
};

/** Orden de las columnas del tablero de pipeline. */
export const OPPORTUNITY_STAGE_ORDER: OpportunityStage[] = [
  "PROSPECTO",
  "CONTACTADO",
  "MUESTRA_ENVIADA",
  "NEGOCIACION",
  "GANADA",
  "PERDIDA",
];

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  LLAMADA: "Llamada",
  WHATSAPP: "WhatsApp",
  VISITA: "Visita",
  EMAIL: "Correo",
  MUESTRA: "Muestra",
  NOTA: "Nota",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  BORRADOR: "Borrador",
  CONFIRMADO: "Confirmado",
  EN_PREPARACION: "En preparación",
  DESPACHADO: "Despachado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  BORRADOR: "neutral",
  CONFIRMADO: "info",
  EN_PREPARACION: "warning",
  DESPACHADO: "primary",
  ENTREGADO: "success",
  CANCELADO: "danger",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  ACEPTADA: "Aceptada",
  RECHAZADA: "Rechazada",
  VENCIDA: "Vencida",
};

export const QUOTE_STATUS_TONE: Record<QuoteStatus, BadgeTone> = {
  BORRADOR: "neutral",
  ENVIADA: "info",
  ACEPTADA: "success",
  RECHAZADA: "danger",
  VENCIDA: "warning",
};

export const BILLING_MODE_LABEL: Record<BillingMode, string> = {
  FACTURA: "Factura",
  REMISION: "Remisión",
};

export const ORDER_CHANNEL_LABEL: Record<OrderChannel, string> = {
  WHATSAPP: "WhatsApp",
  TELEFONO: "Teléfono",
  VISITA: "Visita",
  WEB: "Web",
  PRESENCIAL: "Presencial",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Pago parcial",
  PAGADO: "Pagado",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  PENDIENTE: "warning",
  PARCIAL: "info",
  PAGADO: "success",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

export const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  DISPONIBLE: "Disponible",
  AGOTADO: "Agotado",
  VENCIDO: "Vencido",
  BLOQUEADO: "Bloqueado",
};

export const LOT_STATUS_TONE: Record<LotStatus, BadgeTone> = {
  DISPONIBLE: "success",
  AGOTADO: "neutral",
  VENCIDO: "danger",
  BLOQUEADO: "warning",
};

export const STOCK_MOVEMENT_LABEL: Record<StockMovementType, string> = {
  ENTRADA_PRODUCCION: "Entrada de producción",
  SALIDA_VENTA: "Salida por venta",
  AJUSTE: "Ajuste",
  DEVOLUCION: "Devolución",
  MERMA: "Merma",
  MUESTRA: "Muestra entregada",
  DEVOLUCION_DANADA: "Devolución dañada",
};

export const ROUTE_STATUS_LABEL: Record<RouteStatus, string> = {
  PLANEADA: "Planeada",
  EN_RUTA: "En ruta",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

export const ROUTE_STATUS_TONE: Record<RouteStatus, BadgeTone> = {
  PLANEADA: "info",
  EN_RUTA: "warning",
  COMPLETADA: "success",
  CANCELADA: "danger",
};

/** Días ISO (1 = lunes … 7 = domingo) de la disponibilidad de visitas. */
export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

/** Convierte un Record de etiquetas en opciones para un <select>. */
export function toOptions<T extends string>(
  labels: Record<T, string>,
): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
  }));
}

// ── Conversaciones de WhatsApp ───────────────────────────────

export const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  BOT: "Agente IA",
  HUMANO: "Asesor",
  CERRADA: "Cerrada",
};

export const CONVERSATION_STATUS_TONE: Record<ConversationStatus, BadgeTone> = {
  BOT: "info",
  HUMANO: "warning",
  CERRADA: "neutral",
};

export const MESSAGE_AUTHOR_LABEL: Record<MessageAuthor, string> = {
  CLIENTE: "Cliente",
  AGENTE_IA: "Agente IA",
  ASESOR: "Asesor",
};

export const MESSAGE_TYPE_LABEL: Record<MessageType, string> = {
  TEXTO: "Texto",
  AUDIO: "Audio",
  IMAGEN: "Imagen",
  DOCUMENTO: "Documento",
  INTERACTIVO: "Botón / lista",
  PLANTILLA: "Plantilla",
};

export const DISQUALIFICATION_REASON_LABEL: Record<DisqualificationReason, string> = {
  FUERA_DE_COBERTURA: "Fuera de cobertura",
  SIN_NEGOCIO: "Sin negocio",
  OTRO: "Otro motivo",
};
