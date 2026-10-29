import type { Metadata } from "next";
import { requireAdminPage } from "@/server/guards";
import { listZones } from "@/server/services/zones";
import { PageHeader } from "@/components/layout/page-header";
import { ZoneManager, type ZoneRow } from "@/components/routes/zone-manager";

export const metadata: Metadata = { title: "Zonas de entrega" };

export default async function ZonesPage() {
  await requireAdminPage();

  const zones = await listZones();
  const rows: ZoneRow[] = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    description: zone.description,
    active: zone.active,
    addresses: zone._count.addresses,
    routes: zone._count.routes,
  }));
  const active = rows.filter((zone) => zone.active).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Zonas de entrega"
        description={`${active} ${active === 1 ? "activa" : "activas"}. Se asignan a cada sede del cliente y a las rutas; desactivar una la quita de los selectores sin cambiar lo que ya la tiene.`}
      />
      <ZoneManager zones={rows} />
    </div>
  );
}
