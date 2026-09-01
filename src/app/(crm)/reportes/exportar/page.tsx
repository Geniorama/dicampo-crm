import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { isAdmin, requireUser } from "@/server/guards";
import { prisma } from "@/server/db";
import {
  getRepurchaseAlerts,
  getSalesByProduct,
  getSalesBySeller,
  getSalesTrend,
} from "@/server/services/analytics";
import {
  PERIOD_PRESETS,
  WORKBOOK_SHEETS,
  reportQuerySchema,
} from "@/server/validators/reports";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  ExportTool,
  type SheetOption,
} from "@/components/reports/export-tool";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { OrderStatus, UserRole } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Exportar reportes" };

/** Qué hay en cada hoja, para que quien exporta sepa qué está pidiendo. */
const SHEET_DESCRIPTIONS: Record<keyof typeof WORKBOOK_SHEETS, string> = {
  evolucion: "Ventas y pedidos agrupados por día o por mes.",
  productos: "Cuánto se vendió de cada sabor y presentación.",
  vendedores: "Pedidos y ventas de cada vendedor.",
  recompra: "Clientes activos que llevan tiempo sin comprar.",
  rotacion: "Vendido frente a saldo, con días de cobertura estimados.",
  pedidos: "Un pedido por fila, incluidos los cancelados. Para cuadrar con contabilidad.",
  lineas: "Un producto vendido por fila. Es el grano para una tabla dinámica.",
  kardex: "Movimientos de inventario con lote y motivo. Trazabilidad para auditoría.",
  clientes: "Cartera completa con contacto, sede, zona y condición de pago.",
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const params = flattenSearchParams(await searchParams);
  const query = reportQuerySchema.parse(params);

  const admin = isAdmin(user);
  // Se tipa explícitamente: un `{}` inferido hace que al esparcirlo TypeScript
  // rechace las demás propiedades del filtro.
  const sellerScope: { sellerId?: string } =
    user.role === UserRole.VENDEDOR ? { sellerId: user.id } : {};
  const soldStatuses: OrderStatus[] = [
    "CONFIRMADO",
    "EN_PREPARACION",
    "DESPACHADO",
    "ENTREGADO",
  ];
  const dateRange = { gte: query.rangeFrom, lte: query.rangeTo };

  /*
   * Se cuentan las filas de cada hoja para mostrarlas antes de descargar:
   * así se sabe si vale la pena pedir el kardex completo o si el período
   * elegido está vacío. Son contadores, no las consultas completas.
   */
  const [
    trend,
    byProduct,
    bySeller,
    repurchase,
    variantCount,
    orderCount,
    lineCount,
    kardexCount,
    clientCount,
  ] = await Promise.all([
    getSalesTrend(user, query),
    getSalesByProduct(user, query),
    getSalesBySeller(user, query),
    getRepurchaseAlerts(user, query),
    admin
      ? prisma.productVariant.count({
          where: { active: true, product: { active: true } },
        })
      : 0,
    prisma.order.count({ where: { ...sellerScope, orderDate: dateRange } }),
    prisma.orderItem.count({
      where: {
        order: { ...sellerScope, status: { in: soldStatuses }, orderDate: dateRange },
      },
    }),
    admin ? prisma.stockMovement.count({ where: { createdAt: dateRange } }) : 0,
    prisma.client.count({
      where: user.role === UserRole.VENDEDOR ? { ownerId: user.id } : {},
    }),
  ]);

  const rowsByKey: Record<keyof typeof WORKBOOK_SHEETS, number> = {
    evolucion: trend.points.length,
    productos: byProduct.length,
    vendedores: bySeller.length,
    recompra: repurchase.length,
    rotacion: variantCount,
    pedidos: orderCount,
    lineas: lineCount,
    kardex: kardexCount,
    clientes: clientCount,
  };

  // Inventario y kardex mezclan costos y trazabilidad: son de gerencia. Se
  // filtran aquí y no en el navegador, para no mandar al cliente opciones que
  // su rol no puede usar.
  const sheets: SheetOption[] = (
    Object.keys(WORKBOOK_SHEETS) as (keyof typeof WORKBOOK_SHEETS)[]
  )
    .filter((key) => (key === "rotacion" || key === "kardex" ? admin : true))
    .map((key) => ({
      key,
      label: WORKBOOK_SHEETS[key],
      description: SHEET_DESCRIPTIONS[key],
      rows: rowsByKey[key],
      allowed: true,
    }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Exportar reportes"
        description="Genera un archivo de Excel con una hoja por reporte."
        actions={
          <Link
            href="/reportes"
            className={buttonVariants({ variant: "secondary" })}
          >
            <ArrowLeft aria-hidden="true" />
            Volver
          </Link>
        }
      />

      <ExportTool
        periods={Object.entries(PERIOD_PRESETS).map(([value, label]) => ({
          value,
          label,
        }))}
        defaultPeriod={query.period}
        defaultFrom={params.from ?? isoDate(query.rangeFrom)}
        defaultTo={params.to ?? isoDate(query.rangeTo)}
        defaultInactiveDays={query.inactiveDays}
        sheets={sheets}
      />
    </div>
  );
}
