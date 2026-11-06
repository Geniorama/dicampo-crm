/**
 * Zonas de reparto de Dicampo: cada zona agrupa localidades (o municipios) y
 * se parte en rutas (R1, R2) al norte y al sur. Es la tabla del pedido
 * "Zona / ruta" de la ronda de ajustes; la localidad de la sede decide la zona.
 */

export type DeliveryZoneKey = "NORTE_R1" | "NORTE_R2" | "SUR_R1" | "SUR_R2" | "CUNDINAMARCA" | "NACIONAL";

export const DELIVERY_ZONES: { key: DeliveryZoneKey; label: string; localities: string[] }[] = [
  { key: "NORTE_R1", label: "1 · Norte R1", localities: ["Suba", "Engativá", "Fontibón"] },
  {
    key: "NORTE_R2",
    label: "2 · Norte R2",
    localities: ["Usaquén", "Chapinero", "Teusaquillo", "Barrios Unidos", "La Calera"],
  },
  { key: "SUR_R1", label: "3 · Sur R1", localities: ["Kennedy", "Bosa", "Soacha"] },
  {
    key: "SUR_R2",
    label: "4 · Sur R2",
    localities: [
      "Puente Aranda",
      "Mártires",
      "Los Mártires",
      "Santa Fe",
      "Candelaria",
      "La Candelaria",
      "San Cristóbal",
      "Antonio Nariño",
      "Rafael Uribe",
      "Rafael Uribe Uribe",
      "Tunjuelito",
      "Ciudad Bolívar",
      "Usme",
    ],
  },
  { key: "CUNDINAMARCA", label: "5 · Cundinamarca", localities: ["Funza", "Madrid", "Mosquera", "Facatativá"] },
  { key: "NACIONAL", label: "6 · Nacional", localities: ["Montería", "Santa Marta", "Villavicencio"] },
];

/** "Engativá " → "engativa": sin tildes, mayúsculas ni espacios sobrantes. */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const ZONE_BY_LOCALITY = new Map(
  DELIVERY_ZONES.flatMap((zone) => zone.localities.map((locality) => [normalize(locality), zone.key] as const)),
);

export const DELIVERY_ZONE_LABEL: Record<DeliveryZoneKey, string> = Object.fromEntries(
  DELIVERY_ZONES.map((zone) => [zone.key, zone.label]),
) as Record<DeliveryZoneKey, string>;

/**
 * Zona de una localidad. Sin localidad no hay zona; una localidad que no está
 * en ninguna lista cae en Nacional ("y demás").
 */
export function zoneForLocality(locality: string | null | undefined): DeliveryZoneKey | null {
  if (!locality || normalize(locality) === "") return null;
  return ZONE_BY_LOCALITY.get(normalize(locality)) ?? "NACIONAL";
}

/**
 * Día de entrega de un pedido tomado en `today` ("AAAA-MM-DD", hora de
 * Bogotá): el día hábil siguiente. Se reparte de lunes a sábado.
 */
export function nextDeliveryDay(today: string): string {
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (next.getUTCDay() === 0) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
