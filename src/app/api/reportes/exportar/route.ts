import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { toErrorResponse } from "@/server/http";
import {
  getInventoryTurnover,
  getRepurchaseAlerts,
  getSalesByProduct,
  getSalesBySeller,
  getSalesTrend,
} from "@/server/services/analytics";
import {
  exportQuerySchema,
  reportQuerySchema,
} from "@/server/validators/reports";
import { csvFilename, toCsv, type CsvColumn } from "@/lib/csv";
import { PRESENTATION_LABEL } from "@/lib/labels";

export const runtime = "nodejs";

/**
 * GET /api/reportes/exportar?tipo=… — descarga el reporte como CSV.
 *
 * No usa el envoltorio `route()` porque devuelve texto plano, no el sobre
 * JSON `{ data }`; el manejo de errores sí se reutiliza.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const { tipo } = exportQuerySchema.parse(params);
    const query = reportQuerySchema.parse(params);

    const { csv, prefix } = await buildCsv(tipo, user, query);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(prefix)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

type User = Awaited<ReturnType<typeof requireUser>>;
type Query = ReturnType<typeof reportQuerySchema.parse>;

async function buildCsv(
  tipo: string,
  user: User,
  query: Query,
): Promise<{ csv: string; prefix: string }> {
  switch (tipo) {
    case "ventas": {
      const { points, granularity } = await getSalesTrend(user, query);
      const columns: CsvColumn<(typeof points)[number]>[] = [
        { header: granularity === "mes" ? "Mes" : "Día", value: (row) => row.key },
        { header: "Pedidos", value: (row) => row.orders },
        { header: "Ventas (COP)", value: (row) => row.revenue },
      ];
      return { csv: toCsv(points, columns), prefix: "ventas" };
    }

    case "vendedores": {
      const rows = await getSalesBySeller(user, query);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Vendedor", value: (row) => row.name },
        { header: "Pedidos", value: (row) => row.orders },
        { header: "Ventas (COP)", value: (row) => row.revenue },
      ];
      return { csv: toCsv(rows, columns), prefix: "ventas-por-vendedor" };
    }

    case "productos": {
      const rows = await getSalesByProduct(user, query);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Producto", value: (row) => row.productName },
        {
          header: "Presentación",
          value: (row) => (row.presentation ? PRESENTATION_LABEL[row.presentation] : ""),
        },
        { header: "SKU", value: (row) => row.sku },
        { header: "Cantidad", value: (row) => row.quantity },
        { header: "Ventas (COP)", value: (row) => row.revenue },
      ];
      return { csv: toCsv(rows, columns), prefix: "ventas-por-producto" };
    }

    case "recompra": {
      const rows = await getRepurchaseAlerts(user, query);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Cliente", value: (row) => row.name },
        { header: "Teléfono", value: (row) => row.phone },
        { header: "Vendedor", value: (row) => row.owner },
        { header: "Último pedido", value: (row) => row.lastOrderDate },
        {
          header: "Días sin comprar",
          value: (row) => row.daysSince ?? "Nunca ha comprado",
        },
        { header: "Valor último pedido (COP)", value: (row) => row.lastOrderTotal },
        { header: "Pedidos totales", value: (row) => row.orderCount },
      ];
      return { csv: toCsv(rows, columns), prefix: "clientes-sin-comprar" };
    }

    case "inventario": {
      const rows = await getInventoryTurnover(query);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { header: "Producto", value: (row) => row.productName },
        {
          header: "Presentación",
          value: (row) => (row.presentation ? PRESENTATION_LABEL[row.presentation] : ""),
        },
        { header: "SKU", value: (row) => row.sku },
        { header: "Vendido en el período", value: (row) => row.sold },
        { header: "Saldo actual", value: (row) => row.stock },
        {
          header: "Días de cobertura",
          value: (row) => row.coverageDays ?? "Sin ventas",
        },
      ];
      return { csv: toCsv(rows, columns), prefix: "rotacion-inventario" };
    }

    default:
      // El esquema Zod ya restringe el tipo; esto solo satisface al compilador.
      throw new Error(`Tipo de reporte no soportado: ${tipo}`);
  }
}
