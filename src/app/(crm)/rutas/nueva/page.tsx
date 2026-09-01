import type { Metadata } from "next";
import { DISPATCH_ROLES, requireUserPage } from "@/server/guards";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { RouteForm } from "@/components/routes/route-form";

export const metadata: Metadata = { title: "Nueva ruta" };

export default async function NewRoutePage() {
  await requireUserPage(DISPATCH_ROLES);

  const [zones, drivers] = await Promise.all([
    prisma.deliveryZone.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Reparten despacho y bodega; administración también puede figurar.
    prisma.user.findMany({
      where: { active: true, role: { in: ["DESPACHO", "BODEGA", "ADMIN"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Nueva ruta"
        description="Agrupa los pedidos de un día de reparto en un recorrido."
      />
      <RouteForm zones={zones} drivers={drivers} />
    </div>
  );
}
