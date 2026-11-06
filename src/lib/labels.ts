import type { BadgeTone } from "@/components/ui/badge";
import type { CollectionPriority } from "@/lib/receivables";
import type {
  ActivityType,
  BillingMode,
  QuoteStatus,
  ClientStatus,
  ClientType,
  DeliveryFailReason,
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
  PaymentReceiver,
  CollectionStatus,
  PaymentStatus,
  PaymentTerms,
  Presentation,
  ProductCategory,
  RouteStatus,
  StockMovementType,
  UserRole,
  VisitCategory,
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
  PENDIENTE_FACTURAR: "Pendiente por facturar",
  FACTURADO: "Facturado",
  ANULADO: "Anulado",
};

export const QUOTE_STATUS_TONE: Record<QuoteStatus, BadgeTone> = {
  PENDIENTE_FACTURAR: "warning",
  FACTURADO: "success",
  ANULADO: "danger",
};

/** Estado contable de un pedido: el de su cotización, o ninguno si lo creó un admin directo. */
export const ACCOUNTING_LABEL: Record<QuoteStatus | "SIN_COTIZACION", string> = {
  ...QUOTE_STATUS_LABEL,
  SIN_COTIZACION: "Sin cotización",
};

export const ACCOUNTING_TONE: Record<QuoteStatus | "SIN_COTIZACION", BadgeTone> = {
  ...QUOTE_STATUS_TONE,
  SIN_COTIZACION: "neutral",
};

/** Texto del formulario de cotización sobre qué pasa con el inventario. */
export const QUOTE_INVENTORY_NOTE =
  "La cotización reserva inventario, la factura lo confirma, la anulación devuelve inventario.";

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
  BANCOLOMBIA: "Bancolombia",
  CAJA_SOCIAL: "Caja Social",
  NEQUI: "Nequi",
  OTRO: "Otro",
};

export const PRODUCTION_STATE_LABEL = {
  EN_PREPARACION: "En preparación",
  ALISTADO: "Alistado",
} as const;

export const PRODUCTION_STATE_TONE: Record<keyof typeof PRODUCTION_STATE_LABEL, BadgeTone> = {
  EN_PREPARACION: "warning",
  ALISTADO: "success",
};

export const DISPATCH_STATE_LABEL = {
  EN_RUTA: "En ruta",
  PROGRAMADO: "Programado",
  NO_ENVIADO: "No enviado",
  ENTREGADO: "Entregado",
} as const;

export const DISPATCH_STATE_TONE: Record<keyof typeof DISPATCH_STATE_LABEL, BadgeTone> = {
  EN_RUTA: "primary",
  PROGRAMADO: "info",
  NO_ENVIADO: "danger",
  ENTREGADO: "success",
};

/** Un pedido que no está alistado todavía no tiene despacho. */
export const NO_DISPATCH_LABEL = "Sin despacho disponible";

export const NO_PAYMENT_LABEL = "No ha pagado";

/** Estado de una parada en la tabla del domiciliario. */
export type StopStatus = "EN_RUTA" | "ENTREGADO" | "DEVUELTO";

export const STOP_STATUS_LABEL: Record<StopStatus, string> = {
  EN_RUTA: "En ruta",
  ENTREGADO: "Entregado",
  DEVUELTO: "Devuelto",
};

export const STOP_STATUS_TONE: Record<StopStatus, BadgeTone> = {
  EN_RUTA: "primary",
  ENTREGADO: "success",
  DEVUELTO: "danger",
};

export const PAYMENT_RECEIVER_LABEL: Record<PaymentReceiver, string> = {
  DAVID: "David",
  DOMICILIARIO: "Domiciliario",
  KAREN_CARTERA: "Karen (cartera)",
  ASESOR: "Asesor",
};

export const COLLECTION_STATUS_LABEL: Record<CollectionStatus, string> = {
  PENDIENTE_PAGO: "Pendiente de pago",
  RECAUDADO: "Recaudado",
  NO_CONTESTA: "No contesta",
  ACUERDO_PAGO: "Acuerdo de pago",
};

export const COLLECTION_PRIORITY_LABEL: Record<CollectionPriority, string> = {
  CRITICO: "Crítico",
  ALTO: "Alto",
  MEDIO: "Medio",
  BAJO: "Bajo",
};

export const COLLECTION_PRIORITY_TONE: Record<CollectionPriority, BadgeTone> = {
  CRITICO: "danger",
  ALTO: "warning",
  MEDIO: "info",
  BAJO: "success",
};

export const PAYMENT_BLOCK_LABEL = "Bloqueado por falta de pago";

export const DELIVERY_FAIL_REASON_LABEL: Record<DeliveryFailReason, string> = {
  CLIENTE_AUSENTE: "El cliente no estaba",
  LOCAL_CERRADO: "Local cerrado",
  RECHAZO_PEDIDO: "Rechazó el pedido",
  DIRECCION_NO_ENCONTRADA: "No encontré la dirección",
  SIN_DINERO: "No tenía con qué pagar",
  OTRO: "Otro motivo",
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

/** Motivos de una visita de fidelización a un cliente actual. */
export const VISIT_REASON_LABEL: Record<
  "RECAPACITACION" | "RECUPERACION" | "ENTREGA_PEDIDOS" | "DEVOLUCION_FALTANTES",
  string
> = {
  RECAPACITACION: "Visita re-capacitación",
  RECUPERACION: "Visita recuperación",
  ENTREGA_PEDIDOS: "Visita entrega pedidos",
  DEVOLUCION_FALTANTES: "Visita devolución / faltantes",
};

/** Categoría de una visita: la etiqueta que se ve en el pipeline. */
export const VISIT_CATEGORY_LABEL: Record<VisitCategory, string> = {
  DEMOSTRACION: "Demostración",
  FIDELIZACION: "Fidelización",
  RECAPACITACION: "Re-capacitación",
  RECUPERACION: "Recuperación",
  ENTREGA_PEDIDOS: "Entrega de pedidos",
  DEVOLUCION_FALTANTES: "Devolución / faltantes",
  OTRA: "Otra",
};

export const VISIT_CATEGORY_TONE: Record<VisitCategory, BadgeTone> = {
  DEMOSTRACION: "info",
  FIDELIZACION: "success",
  RECAPACITACION: "primary",
  RECUPERACION: "warning",
  ENTREGA_PEDIDOS: "neutral",
  DEVOLUCION_FALTANTES: "danger",
  OTRA: "neutral",
};

/** Título por defecto de la visita a un cliente nuevo. */
export const NEW_CLIENT_VISIT_TITLE = "Visita cliente nuevo";
