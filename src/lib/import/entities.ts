import {
  CLIENT_STATUS_LABEL,
  CLIENT_TYPE_LABEL,
  DOC_TYPE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  PAYMENT_TERMS_LABEL,
  PRESENTATION_LABEL,
  PRODUCT_CATEGORY_LABEL,
  toOptions,
} from "@/lib/labels";
import type { ImportMode } from "./types";

/**
 * Catálogo de lo que se puede cargar de forma masiva.
 *
 * Es solo descripción — etiquetas, alias y ejemplos —, sin una sola consulta:
 * así lo puede leer tanto la pantalla de cotejo en el navegador como el motor
 * del servidor, y la lista de campos que ve la persona es exactamente la que
 * se va a importar.
 *
 * Los **alias** son el corazón del asunto: son los encabezados con los que la
 * misma cosa aparece en las hojas reales ("Razón social", "Cliente",
 * "Empresa"). Cuantos más haya, menos cotejo manual queda por hacer.
 */

export type ImportFieldOption = { value: string; label: string };

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
  /** Encabezados equivalentes reconocidos al cotejar. */
  aliases?: string[];
  /** Lista cerrada: además de una columna, permite fijar un valor único. */
  options?: ImportFieldOption[];
  /** Valor de muestra para la plantilla descargable. */
  example?: string;
  /** Agrupa los campos en la pantalla de cotejo. */
  group?: string;
};

export type ImportEntity = {
  key: ImportEntityKey;
  label: string;
  description: string;
  /** Módulo al que pertenece, para volver a él al terminar. */
  moduleHref: string;
  moduleLabel: string;
  /** Cómo se reconoce una fila que ya existe en la base. */
  identity: string;
  /** Modos admitidos; los lotes, por ejemplo, solo se crean. */
  modes: ImportMode[];
  fields: ImportField[];
  /** Advertencias que conviene leer antes de cargar. */
  notes?: string[];
};

export const IMPORT_ENTITY_KEYS = [
  "clientes",
  "contactos",
  "sedes",
  "productos",
  "precios",
  "lotes",
  "oportunidades",
] as const;

export type ImportEntityKey = (typeof IMPORT_ENTITY_KEYS)[number];

export function isImportEntityKey(value: string): value is ImportEntityKey {
  return (IMPORT_ENTITY_KEYS as readonly string[]).includes(value);
}

/** Campos con los que se localiza al cliente dueño de la fila. */
const CLIENT_REFERENCE_FIELDS: ImportField[] = [
  {
    key: "clientNit",
    label: "NIT del cliente",
    aliases: ["nit", "documento", "identificacion", "nit cliente"],
    hint: "Se ignoran puntos y guiones.",
    example: "900123456",
  },
  {
    key: "clientName",
    label: "Cliente (razón social)",
    aliases: ["cliente", "razon social", "empresa", "negocio", "establecimiento"],
    hint: "Alternativa al NIT. Se compara contra la razón social y el nombre comercial.",
    example: "Panadería El Trigo SAS",
  },
];

/** Campos con los que se localiza la variante vendible. */
const VARIANT_REFERENCE_FIELDS: ImportField[] = [
  {
    key: "sku",
    label: "SKU",
    aliases: ["codigo", "referencia", "cod", "item", "codigo producto"],
    example: "MANGO-K",
  },
  {
    key: "flavor",
    label: "Sabor",
    aliases: ["fruta", "producto", "nombre"],
    hint: "Alternativa al SKU: sabor más presentación.",
    example: "Mango",
  },
  {
    key: "presentation",
    label: "Presentación",
    aliases: ["unidad", "empaque", "medida"],
    options: toOptions(PRESENTATION_LABEL),
    example: "Kilo",
  },
];

const clientes: ImportEntity = {
  key: "clientes",
  label: "Clientes",
  description:
    "Da de alta la cartera completa. Cada fila puede traer además la sede de entrega y el contacto principal, que es como suelen venir las listas.",
  moduleHref: "/clientes",
  moduleLabel: "Clientes",
  identity: "NIT. Si la fila no lo trae, por razón social exacta.",
  modes: ["mezclar", "crear", "actualizar"],
  notes: [
    "La sede solo se crea si la fila trae dirección, y el contacto solo si trae nombre.",
    "Si el NIT viene sin dígito de verificación, se calcula con el algoritmo de la DIAN.",
    "Un cliente en estado Activo necesita NIT: sin él no se le puede facturar.",
  ],
  fields: [
    {
      key: "businessName",
      label: "Razón social",
      required: true,
      group: "Cliente",
      aliases: ["nombre", "cliente", "empresa", "nombre legal", "negocio"],
      example: "Panadería El Trigo SAS",
    },
    {
      key: "tradeName",
      label: "Nombre comercial",
      group: "Cliente",
      aliases: ["establecimiento", "marca", "nombre del negocio"],
      example: "El Trigo",
    },
    {
      key: "nit",
      label: "NIT",
      group: "Cliente",
      aliases: ["documento", "identificacion", "rut", "cedula", "nit sin dv"],
      hint: "Se ignoran puntos y guiones.",
      example: "900123456",
    },
    {
      key: "nitDv",
      label: "Dígito de verificación",
      group: "Cliente",
      aliases: ["dv", "digito", "digito verificacion"],
      hint: "Si falta, se calcula.",
      example: "7",
    },
    {
      key: "type",
      label: "Tipo de cliente",
      group: "Cliente",
      aliases: ["tipo", "categoria", "segmento", "canal", "giro"],
      options: toOptions(CLIENT_TYPE_LABEL),
      example: "Panadería",
    },
    {
      key: "status",
      label: "Estado",
      group: "Cliente",
      aliases: ["situacion", "estado cliente"],
      options: toOptions(CLIENT_STATUS_LABEL),
      example: "Activo",
    },
    {
      key: "email",
      label: "Correo",
      group: "Cliente",
      aliases: ["email", "correo electronico", "e mail"],
      example: "compras@eltrigo.co",
    },
    {
      key: "phone",
      label: "Teléfono",
      group: "Cliente",
      aliases: ["telefono", "celular", "movil", "fijo", "tel"],
      example: "3101234567",
    },
    {
      key: "paymentTerms",
      label: "Condición de pago",
      group: "Cliente",
      aliases: ["forma de pago", "pago", "plazo", "condiciones"],
      options: toOptions(PAYMENT_TERMS_LABEL),
      example: "Crédito 15 días",
    },
    {
      key: "creditLimit",
      label: "Cupo de crédito",
      group: "Cliente",
      aliases: ["cupo", "credito", "limite de credito"],
      example: "1.500.000",
    },
    {
      key: "ownerRef",
      label: "Vendedor",
      group: "Cliente",
      aliases: ["asesor", "responsable", "comercial", "ejecutivo", "vendedora"],
      hint: "Correo o nombre de un usuario del CRM.",
      example: "vendedor@dicampo.co",
    },
    {
      key: "priceListName",
      label: "Lista de precios",
      group: "Cliente",
      aliases: ["lista", "tarifa"],
      hint: "Si se deja vacía, aplica la lista por defecto.",
      example: "General",
    },
    {
      key: "notes",
      label: "Notas",
      group: "Cliente",
      aliases: ["observaciones", "comentarios"],
    },
    {
      key: "addressLabel",
      label: "Sede: nombre",
      group: "Sede de entrega",
      aliases: ["sede", "sucursal", "punto"],
      hint: "Si falta y hay dirección, se usa “Sede principal”.",
      example: "Sede Chapinero",
    },
    {
      key: "address",
      label: "Sede: dirección",
      group: "Sede de entrega",
      aliases: ["direccion", "domicilio", "direccion de entrega"],
      example: "Calle 53 # 13-40",
    },
    {
      key: "neighborhood",
      label: "Sede: barrio",
      group: "Sede de entrega",
      aliases: ["barrio", "sector"],
      example: "Chapinero",
    },
    {
      key: "city",
      label: "Sede: ciudad",
      group: "Sede de entrega",
      aliases: ["ciudad", "municipio"],
      example: "Bogotá",
    },
    {
      key: "zoneName",
      label: "Sede: zona",
      group: "Sede de entrega",
      aliases: ["zona", "localidad", "zona de reparto"],
      hint: "Debe existir en las zonas de despacho.",
      example: "Chapinero",
    },
    {
      key: "deliveryNotes",
      label: "Sede: indicaciones",
      group: "Sede de entrega",
      aliases: ["indicaciones", "horario", "observaciones de entrega"],
      example: "Recibe portería hasta las 11 a. m.",
    },
    {
      key: "contactFirstName",
      label: "Contacto: nombre",
      group: "Contacto",
      aliases: ["contacto", "persona de contacto", "encargado", "nombre contacto"],
      example: "María",
    },
    {
      key: "contactLastName",
      label: "Contacto: apellido",
      group: "Contacto",
      aliases: ["apellido", "apellidos"],
      example: "Rodríguez",
    },
    {
      key: "contactJobTitle",
      label: "Contacto: cargo",
      group: "Contacto",
      aliases: ["cargo", "rol", "puesto"],
      example: "Administradora",
    },
    {
      key: "contactPhone",
      label: "Contacto: teléfono",
      group: "Contacto",
      aliases: ["telefono contacto", "celular contacto"],
      example: "3109876543",
    },
    {
      key: "contactWhatsapp",
      label: "Contacto: WhatsApp",
      group: "Contacto",
      aliases: ["whatsapp", "wasap", "wpp"],
      example: "573109876543",
    },
    {
      key: "contactEmail",
      label: "Contacto: correo",
      group: "Contacto",
      aliases: ["correo contacto", "email contacto"],
      example: "maria@eltrigo.co",
    },
  ],
};

const contactos: ImportEntity = {
  key: "contactos",
  label: "Contactos",
  description:
    "Agenda de personas por cliente. Sirve cuando un cliente tiene varios interlocutores y vienen en una hoja aparte.",
  moduleHref: "/clientes",
  moduleLabel: "Clientes",
  identity: "Cliente más nombre y apellido.",
  modes: ["mezclar", "crear", "actualizar"],
  notes: [
    "Marcar a alguien como principal desmarca al anterior: el principal es excluyente.",
  ],
  fields: [
    ...CLIENT_REFERENCE_FIELDS.map((field) => ({ ...field, group: "Cliente" })),
    {
      key: "firstName",
      label: "Nombre",
      required: true,
      group: "Contacto",
      aliases: ["nombres", "nombre contacto", "contacto"],
      example: "María",
    },
    {
      key: "lastName",
      label: "Apellido",
      group: "Contacto",
      aliases: ["apellidos"],
      example: "Rodríguez",
    },
    {
      key: "jobTitle",
      label: "Cargo",
      group: "Contacto",
      aliases: ["rol", "puesto", "ocupacion"],
      example: "Chef",
    },
    {
      key: "email",
      label: "Correo",
      group: "Contacto",
      aliases: ["email", "correo electronico"],
      example: "maria@eltrigo.co",
    },
    {
      key: "phone",
      label: "Teléfono",
      group: "Contacto",
      aliases: ["telefono", "celular", "movil", "fijo"],
      example: "3109876543",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      group: "Contacto",
      aliases: ["wasap", "wpp", "numero whatsapp"],
      example: "573109876543",
    },
    {
      key: "docType",
      label: "Tipo de documento",
      group: "Contacto",
      aliases: ["tipo documento", "tipo id"],
      options: toOptions(DOC_TYPE_LABEL),
      example: "Cédula de ciudadanía",
    },
    {
      key: "docNumber",
      label: "Número de documento",
      group: "Contacto",
      aliases: ["documento", "cedula", "identificacion"],
      example: "52123456",
    },
    {
      key: "isPrimary",
      label: "¿Es el contacto principal?",
      group: "Contacto",
      aliases: ["principal", "contacto principal"],
      hint: "Acepta Sí, X o 1.",
      example: "Sí",
    },
    {
      key: "notes",
      label: "Notas",
      group: "Contacto",
      aliases: ["observaciones", "comentarios"],
    },
  ],
};

const sedes: ImportEntity = {
  key: "sedes",
  label: "Sedes de entrega",
  description:
    "Direcciones a las que se despacha. Un cliente con varios puntos necesita una fila por punto.",
  moduleHref: "/clientes",
  moduleLabel: "Clientes",
  identity: "Cliente más dirección.",
  modes: ["mezclar", "crear", "actualizar"],
  notes: [
    "La primera sede de un cliente queda como principal, aunque la columna diga lo contrario: sin sede no se le puede despachar.",
    "La zona debe existir en las zonas de despacho; si no coincide ninguna, la sede entra sin zona.",
  ],
  fields: [
    ...CLIENT_REFERENCE_FIELDS.map((field) => ({ ...field, group: "Cliente" })),
    {
      key: "label",
      label: "Nombre de la sede",
      required: true,
      group: "Sede",
      aliases: ["sede", "sucursal", "etiqueta", "punto"],
      example: "Sede Chapinero",
    },
    {
      key: "address",
      label: "Dirección",
      required: true,
      group: "Sede",
      aliases: ["direccion", "domicilio", "direccion de entrega"],
      example: "Calle 53 # 13-40",
    },
    {
      key: "neighborhood",
      label: "Barrio",
      group: "Sede",
      aliases: ["barrio", "sector"],
      example: "Chapinero",
    },
    {
      key: "city",
      label: "Ciudad",
      group: "Sede",
      aliases: ["ciudad", "municipio"],
      example: "Bogotá",
    },
    {
      key: "zoneName",
      label: "Zona",
      group: "Sede",
      aliases: ["zona", "localidad", "zona de reparto"],
      example: "Chapinero",
    },
    {
      key: "deliveryNotes",
      label: "Indicaciones de entrega",
      group: "Sede",
      aliases: ["indicaciones", "horario", "observaciones"],
      example: "Timbre 2, preguntar por el chef",
    },
    {
      key: "isPrimary",
      label: "¿Es la sede principal?",
      group: "Sede",
      aliases: ["principal", "sede principal"],
      example: "Sí",
    },
    {
      key: "lat",
      label: "Latitud",
      group: "Sede",
      aliases: ["latitud"],
      example: "4.6486",
    },
    {
      key: "lng",
      label: "Longitud",
      group: "Sede",
      aliases: ["longitud", "lon"],
      example: "-74.0626",
    },
  ],
};

const productos: ImportEntity = {
  key: "productos",
  label: "Productos y presentaciones",
  description:
    "Sabores del catálogo con su presentación vendible y, si viene, el precio de la lista por defecto.",
  moduleHref: "/catalogo",
  moduleLabel: "Catálogo",
  identity: "Sabor, que es único. La presentación decide qué variante se crea.",
  modes: ["mezclar", "crear", "actualizar"],
  notes: [
    "El IVA se escribe como porcentaje (0, 5 o 19) o como fracción (0,19). Solo se admiten esas tres tarifas.",
    "Sin SKU en el archivo, se genera del sabor: Limón Hierbabuena + Kilo → LIMHIE-K.",
    "Los productos no se borran: para retirar uno se desactiva, porque los pedidos históricos lo referencian.",
  ],
  fields: [
    {
      key: "name",
      label: "Nombre del producto",
      required: true,
      aliases: ["producto", "descripcion", "articulo"],
      example: "Pulpa de mango",
    },
    {
      key: "flavor",
      label: "Sabor",
      required: true,
      aliases: ["fruta", "sabor del producto"],
      example: "Mango",
    },
    {
      key: "category",
      label: "Categoría",
      aliases: ["linea", "tipo", "familia"],
      options: toOptions(PRODUCT_CATEGORY_LABEL),
      example: "Pulpa",
    },
    {
      key: "description",
      label: "Descripción",
      aliases: ["detalle", "observaciones"],
    },
    {
      key: "taxRate",
      label: "IVA",
      aliases: ["impuesto", "tarifa iva"],
      hint: "0, 5 o 19.",
      example: "0",
    },
    {
      key: "active",
      label: "¿Activo?",
      aliases: ["activo", "estado", "vigente"],
      example: "Sí",
    },
    {
      key: "presentation",
      label: "Presentación",
      aliases: ["unidad", "empaque", "medida"],
      options: toOptions(PRESENTATION_LABEL),
      hint: "Sin presentación se crea solo el sabor, que todavía no se puede vender.",
      example: "Kilo",
    },
    {
      key: "sku",
      label: "SKU",
      aliases: ["codigo", "referencia", "cod"],
      example: "MANGO-K",
    },
    {
      key: "price",
      label: "Precio",
      aliases: ["valor", "precio unitario", "precio de venta", "pvp"],
      example: "12.500",
    },
    {
      key: "priceListName",
      label: "Lista de precios",
      aliases: ["lista", "tarifa"],
      hint: "Si se deja vacía, aplica la lista por defecto.",
      example: "General",
    },
  ],
};

const precios: ImportEntity = {
  key: "precios",
  label: "Lista de precios",
  description:
    "Sube una lista completa de una vez. Es la forma práctica de aplicar un ajuste sin tocar producto por producto.",
  moduleHref: "/catalogo/precios",
  moduleLabel: "Catálogo",
  identity:
    "SKU (o sabor más presentación) dentro de la lista y la cantidad mínima.",
  modes: ["mezclar", "crear", "actualizar"],
  notes: [
    "Cambiar un precio no altera ningún pedido ya creado: cada pedido guarda el precio con el que se tomó.",
    "La cantidad mínima permite escalones por volumen; si se omite, es 1.",
  ],
  fields: [
    ...VARIANT_REFERENCE_FIELDS.map((field) => ({ ...field, group: "Producto" })),
    {
      key: "price",
      label: "Precio",
      required: true,
      group: "Precio",
      aliases: ["valor", "precio unitario", "precio de venta", "pvp", "nuevo precio"],
      example: "12.500",
    },
    {
      key: "minQty",
      label: "Cantidad mínima",
      group: "Precio",
      aliases: ["cantidad minima", "desde", "escalon"],
      hint: "Escalón por volumen. Por defecto 1.",
      example: "1",
    },
    {
      key: "priceListName",
      label: "Lista de precios",
      group: "Precio",
      aliases: ["lista", "tarifa"],
      hint: "Si se deja vacía, aplica la lista por defecto.",
      example: "General",
    },
  ],
};

const lotes: ImportEntity = {
  key: "lotes",
  label: "Lotes de inventario",
  description:
    "Entrada de producción por lote, con su fecha de vencimiento. Es lo que alimenta la rotación FEFO.",
  moduleHref: "/inventario",
  moduleLabel: "Inventario",
  identity: "Producto más código de lote.",
  // Un lote solo se crea: el saldo se mueve por kardex, nunca reescribiéndolo.
  modes: ["crear"],
  notes: [
    "Un lote no se actualiza. El saldo cambia por entradas, ajustes y mermas, que quedan en el kardex; reescribir la cantidad descuadraría la auditoría.",
    "Cada lote cargado escribe su movimiento de entrada de producción a tu nombre.",
    "El vencimiento debe ser posterior a la producción.",
  ],
  fields: [
    ...VARIANT_REFERENCE_FIELDS.map((field) => ({ ...field, group: "Producto" })),
    {
      key: "lotCode",
      label: "Código de lote",
      required: true,
      group: "Lote",
      aliases: ["lote", "batch", "codigo de lote"],
      example: "L-20260901-MAN",
    },
    {
      key: "productionDate",
      label: "Fecha de producción",
      required: true,
      group: "Lote",
      aliases: ["produccion", "elaboracion", "fabricacion"],
      hint: "Admite 05/09/2026 o 2026-09-05.",
      example: "01/09/2026",
    },
    {
      key: "expiryDate",
      label: "Fecha de vencimiento",
      required: true,
      group: "Lote",
      aliases: ["vencimiento", "caducidad", "expira", "vence"],
      example: "01/03/2027",
    },
    {
      key: "quantity",
      label: "Cantidad",
      required: true,
      group: "Lote",
      aliases: ["unidades", "kilos", "saldo", "existencia"],
      example: "120",
    },
    {
      key: "notes",
      label: "Notas",
      group: "Lote",
      aliases: ["observaciones", "comentarios"],
    },
  ],
};

const oportunidades: ImportEntity = {
  key: "oportunidades",
  label: "Oportunidades",
  description:
    "Embudo comercial: negocios en curso por cliente, con su etapa y su valor estimado.",
  moduleHref: "/pipeline",
  moduleLabel: "Pipeline",
  identity: "Cliente más título de la oportunidad.",
  modes: ["mezclar", "crear", "actualizar"],
  notes: [
    "Una fila en etapa Perdida necesita motivo.",
    "Una fila en etapa Ganada activa al cliente si seguía como prospecto.",
  ],
  fields: [
    ...CLIENT_REFERENCE_FIELDS.map((field) => ({ ...field, group: "Cliente" })),
    {
      key: "title",
      label: "Título",
      required: true,
      group: "Oportunidad",
      aliases: ["oportunidad", "asunto", "negocio", "descripcion"],
      example: "Suministro mensual de pulpa",
    },
    {
      key: "stage",
      label: "Etapa",
      group: "Oportunidad",
      aliases: ["fase", "estado", "etapa del embudo"],
      options: toOptions(OPPORTUNITY_STAGE_LABEL),
      example: "Negociación",
    },
    {
      key: "estimatedValue",
      label: "Valor estimado",
      group: "Oportunidad",
      aliases: ["valor", "monto", "potencial", "venta mensual"],
      hint: "Valor mensual estimado en pesos.",
      example: "2.400.000",
    },
    {
      key: "expectedCloseDate",
      label: "Cierre estimado",
      group: "Oportunidad",
      aliases: ["fecha de cierre", "cierre", "fecha estimada"],
      example: "30/11/2026",
    },
    {
      key: "ownerRef",
      label: "Vendedor",
      group: "Oportunidad",
      aliases: ["asesor", "responsable", "comercial", "ejecutivo"],
      hint: "Correo o nombre de un usuario del CRM.",
      example: "vendedor@dicampo.co",
    },
    {
      key: "lostReason",
      label: "Motivo de pérdida",
      group: "Oportunidad",
      aliases: ["motivo", "razon", "causa"],
      hint: "Obligatorio si la etapa es Perdida.",
    },
    {
      key: "notes",
      label: "Notas",
      group: "Oportunidad",
      aliases: ["observaciones", "comentarios"],
    },
  ],
};

export const IMPORT_ENTITIES: Record<ImportEntityKey, ImportEntity> = {
  clientes,
  contactos,
  sedes,
  productos,
  precios,
  lotes,
  oportunidades,
};

/** Agrupa los campos para pintarlos por bloques en la pantalla de cotejo. */
export function groupFields(
  fields: readonly ImportField[],
): { group: string; fields: ImportField[] }[] {
  const groups: { group: string; fields: ImportField[] }[] = [];

  for (const field of fields) {
    const name = field.group ?? "Datos";
    const current = groups.find((entry) => entry.group === name);
    if (current) current.fields.push(field);
    else groups.push({ group: name, fields: [field] });
  }

  return groups;
}
