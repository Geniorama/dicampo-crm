import type { NextRequest } from "next/server";
import { isAdmin, requireUser } from "@/server/guards";
import { toErrorResponse } from "@/server/http";
import {
  getInventoryTurnover,
  getRepurchaseAlerts,
  getSalesByProduct,
  getSalesBySeller,
  getSalesSummary,
  getSalesTrend,
} from "@/server/services/analytics";
import {
  getClientDirectory,
  getKardexReport,
  getOrderLines,
  getOrdersDetail,
} from "@/server/services/exports";
import {
  PERIOD_PRESETS,
  reportQuerySchema,
  workbookQuerySchema,
  type WorkbookSheet,
} from "@/server/validators/reports";
import { buildWorkbook, defineSheet } from "@/server/reports/workbook";
import { formatCOP } from "@/lib/format";
import {
  CLIENT_STATUS_LABEL,
  CLIENT_TYPE_LABEL,
  ORDER_CHANNEL_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_TERMS_LABEL,
  PRESENTATION_LABEL,
  STOCK_MOVEMENT_LABEL,
} from "@/lib/labels";

export const runtime = "nodejs";
// Un libro con el kardex completo puede tardar; el techo de Netlify es 26 s.
export const maxDuration = 60;

/**
 * GET /api/reportes/excel — descarga un libro con una hoja por reporte.
 *
 * No usa el envoltorio `route()` porque devuelve un binario, no el sobre JSON;
 * el manejo de errores sí se reutiliza.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const search = request.nextUrl.searchParams;

    const query = reportQuerySchema.parse(Object.fromEntries(search));
    /*
     * `hojas` se lee con getAll: viene repetido en la URL (?hojas=a&hojas=b)
     * porque es lo que envía un grupo de casillas, y `Object.fromEntries`
     * colapsa los repetidos quedándose solo con el último.
     */
    const { hojas } = workbookQuerySchema.parse({ hojas: search.getAll("hojas") });

    const include = (name: WorkbookSheet) => hojas.includes(name);

    // Solo se consulta lo que se va a incluir: el kardex y las líneas de
    // pedido son las consultas caras del conjunto.
    const [
      summary,
      trend,
      byProduct,
      bySeller,
      repurchase,
      turnover,
      orders,
      lines,
      kardex,
      clients,
    ] = await Promise.all([
      getSalesSummary(user, query),
      include("evolucion") ? getSalesTrend(user, query) : null,
      include("productos") ? getSalesByProduct(user, query) : null,
      include("vendedores") ? getSalesBySeller(user, query) : null,
      include("recompra") ? getRepurchaseAlerts(user, query) : null,
      // La rotación mezcla inventario con ventas: es información de gerencia.
      include("rotacion") && isAdmin(user) ? getInventoryTurnover(query) : null,
      include("pedidos") ? getOrdersDetail(user, query) : null,
      include("lineas") ? getOrderLines(user, query) : null,
      include("kardex") && isAdmin(user) ? getKardexReport(query) : null,
      include("clientes") ? getClientDirectory(user) : null,
    ]);

    const sheets = [];

    if (trend) {
      sheets.push(
        defineSheet({
          name: "Evolución",
          rows: trend.points,
          note: `Agrupado por ${trend.granularity}.`,
          columns: [
            {
              header: trend.granularity === "mes" ? "Mes" : "Día",
              value: (row) => row.key,
              width: 14,
            },
            { header: "Pedidos", value: (row) => row.orders, kind: "number" },
            { header: "Ventas", value: (row) => row.revenue, kind: "money" },
          ],
        }),
      );
    }

    if (byProduct) {
      sheets.push(
        defineSheet({
          name: "Por producto",
          rows: byProduct,
          columns: [
            { header: "Producto", value: (row) => row.productName },
            {
              header: "Presentación",
              value: (row) =>
                row.presentation ? PRESENTATION_LABEL[row.presentation] : "",
            },
            { header: "SKU", value: (row) => row.sku },
            { header: "Cantidad", value: (row) => row.quantity, kind: "quantity" },
            { header: "Ventas", value: (row) => row.revenue, kind: "money" },
          ],
        }),
      );
    }

    if (bySeller) {
      sheets.push(
        defineSheet({
          name: "Por vendedor",
          rows: bySeller,
          columns: [
            { header: "Vendedor", value: (row) => row.name },
            { header: "Pedidos", value: (row) => row.orders, kind: "number" },
            { header: "Ventas", value: (row) => row.revenue, kind: "money" },
          ],
        }),
      );
    }

    if (repurchase) {
      sheets.push(
        defineSheet({
          name: "Recompra",
          rows: repurchase,
          note: `Clientes activos sin comprar hace ${query.inactiveDays} días o más.`,
          columns: [
            { header: "Cliente", value: (row) => row.name },
            { header: "Teléfono", value: (row) => row.phone ?? "" },
            { header: "Vendedor", value: (row) => row.owner },
            {
              header: "Último pedido",
              value: (row) => row.lastOrderDate,
              kind: "date",
            },
            {
              header: "Días sin comprar",
              value: (row) => row.daysSince ?? "Nunca ha comprado",
            },
            {
              header: "Valor último pedido",
              value: (row) => row.lastOrderTotal,
              kind: "money",
            },
            { header: "Pedidos totales", value: (row) => row.orderCount, kind: "number" },
          ],
        }),
      );
    }

    if (turnover) {
      sheets.push(
        defineSheet({
          name: "Rotación",
          rows: turnover,
          note: "La cobertura estima cuántos días dura el saldo al ritmo de venta del período.",
          columns: [
            { header: "Producto", value: (row) => row.productName },
            {
              header: "Presentación",
              value: (row) =>
                row.presentation ? PRESENTATION_LABEL[row.presentation] : "",
            },
            { header: "SKU", value: (row) => row.sku },
            { header: "Vendido", value: (row) => row.sold, kind: "quantity" },
            { header: "Saldo actual", value: (row) => row.stock, kind: "quantity" },
            {
              header: "Días de cobertura",
              value: (row) => row.coverageDays ?? "Sin ventas",
            },
          ],
        }),
      );
    }

    if (orders) {
      sheets.push(
        defineSheet({
          name: "Pedidos",
          rows: orders,
          note: "Incluye los pedidos cancelados, para poder cuadrar con contabilidad.",
          columns: [
            { header: "Pedido", value: (row) => row.orderNumber, kind: "number" },
            { header: "Fecha", value: (row) => row.orderDate, kind: "date" },
            { header: "Cliente", value: (row) => row.client },
            { header: "Razón social", value: (row) => row.businessName },
            { header: "NIT", value: (row) => row.nit ?? "" },
            { header: "Vendedor", value: (row) => row.seller },
            { header: "Estado", value: (row) => ORDER_STATUS_LABEL[row.status] },
            { header: "Canal", value: (row) => ORDER_CHANNEL_LABEL[row.channel] },
            { header: "Sede", value: (row) => row.addressLabel },
            { header: "Zona", value: (row) => row.zone },
            { header: "Ruta", value: (row) => row.route },
            {
              header: "Entrega solicitada",
              value: (row) => row.requestedDeliveryDate,
              kind: "date",
            },
            { header: "Entregado", value: (row) => row.deliveredAt, kind: "date" },
            {
              header: "Condición de pago",
              value: (row) => PAYMENT_TERMS_LABEL[row.paymentTerms],
            },
            {
              header: "Estado de pago",
              value: (row) => PAYMENT_STATUS_LABEL[row.paymentStatus],
            },
            { header: "Líneas", value: (row) => row.lineCount, kind: "number" },
            { header: "Subtotal", value: (row) => row.subtotal, kind: "money" },
            { header: "Descuento", value: (row) => row.discount, kind: "money" },
            { header: "IVA", value: (row) => row.tax, kind: "money" },
            { header: "Total", value: (row) => row.total, kind: "money" },
            { header: "Motivo de cancelación", value: (row) => row.cancelReason },
          ],
        }),
      );
    }

    if (lines) {
      sheets.push(
        defineSheet({
          name: "Líneas de pedido",
          rows: lines,
          note: "Una fila por producto vendido. Es el grano para una tabla dinámica.",
          columns: [
            { header: "Pedido", value: (row) => row.orderNumber, kind: "number" },
            { header: "Fecha", value: (row) => row.orderDate, kind: "date" },
            { header: "Cliente", value: (row) => row.client },
            { header: "Vendedor", value: (row) => row.seller },
            { header: "Producto", value: (row) => row.product },
            {
              header: "Presentación",
              value: (row) => PRESENTATION_LABEL[row.presentation],
            },
            { header: "SKU", value: (row) => row.sku },
            { header: "Cantidad", value: (row) => row.quantity, kind: "quantity" },
            { header: "Precio unitario", value: (row) => row.unitPrice, kind: "money" },
            { header: "Descuento", value: (row) => row.discount, kind: "money" },
            { header: "Subtotal", value: (row) => row.subtotal, kind: "money" },
          ],
        }),
      );
    }

    if (kardex) {
      sheets.push(
        defineSheet({
          name: "Kardex",
          rows: kardex,
          note: "Movimientos de inventario del período. Las salidas van en negativo.",
          columns: [
            { header: "Fecha", value: (row) => row.date, kind: "date" },
            { header: "Producto", value: (row) => row.product },
            {
              header: "Presentación",
              value: (row) => PRESENTATION_LABEL[row.presentation],
            },
            { header: "SKU", value: (row) => row.sku },
            { header: "Lote", value: (row) => row.lotCode },
            { header: "Producción", value: (row) => row.productionDate, kind: "date" },
            { header: "Vencimiento", value: (row) => row.expiryDate, kind: "date" },
            { header: "Movimiento", value: (row) => STOCK_MOVEMENT_LABEL[row.type] },
            { header: "Cantidad", value: (row) => row.quantity, kind: "quantity" },
            { header: "Pedido", value: (row) => row.orderNumber ?? "" },
            { header: "Usuario", value: (row) => row.user },
            { header: "Motivo", value: (row) => row.reason },
          ],
        }),
      );
    }

    if (clients) {
      sheets.push(
        defineSheet({
          name: "Clientes",
          rows: clients,
          note: "Directorio completo de la cartera, con su contacto y sede principal.",
          columns: [
            { header: "Código", value: (row) => row.sequence, kind: "number" },
            { header: "Razón social", value: (row) => row.businessName },
            { header: "Nombre comercial", value: (row) => row.tradeName },
            { header: "NIT", value: (row) => row.nit },
            { header: "DV", value: (row) => row.nitDv, width: 6 },
            { header: "Tipo", value: (row) => CLIENT_TYPE_LABEL[row.type] },
            { header: "Estado", value: (row) => CLIENT_STATUS_LABEL[row.status] },
            { header: "Vendedor", value: (row) => row.owner },
            { header: "Teléfono", value: (row) => row.phone },
            { header: "Correo", value: (row) => row.email },
            { header: "Contacto", value: (row) => row.contactName },
            { header: "Cargo", value: (row) => row.contactJob },
            { header: "Tel. contacto", value: (row) => row.contactPhone },
            { header: "Correo contacto", value: (row) => row.contactEmail },
            { header: "Dirección", value: (row) => row.address },
            { header: "Barrio", value: (row) => row.neighborhood },
            { header: "Ciudad", value: (row) => row.city },
            { header: "Zona", value: (row) => row.zone },
            {
              header: "Condición de pago",
              value: (row) => PAYMENT_TERMS_LABEL[row.paymentTerms],
            },
            { header: "Cupo de crédito", value: (row) => row.creditLimit, kind: "money" },
            { header: "Lista de precios", value: (row) => row.priceList },
            { header: "Pedidos", value: (row) => row.orderCount, kind: "number" },
            { header: "Cliente desde", value: (row) => row.createdAt, kind: "date" },
          ],
        }),
      );
    }

    const buffer = await buildWorkbook({
      meta: {
        generatedBy: user.name,
        generatedAt: new Date(),
        periodLabel: PERIOD_PRESETS[query.period],
        rangeFrom: query.rangeFrom,
        rangeTo: query.rangeTo,
        summary: [
          { label: "Ventas", value: formatCOP(summary.revenue) },
          { label: "Pedidos", value: summary.orderCount },
          { label: "Ticket promedio", value: formatCOP(summary.averageTicket) },
          { label: "Clientes que compraron", value: summary.clientCount },
        ],
      },
      sheets,
    });

    const filename = `reportes-dicampo-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
