/**
 * Reglas puras del despacho diario: agrupar por localidad, armar la lista de
 * alistamiento por sabor y generar los enlaces de navegación.
 *
 * Sin base de datos, para probarlas con casos reales y compartirlas entre la
 * pantalla del día y la de cada ruta.
 */

export const NO_LOCALITY = "Sin localidad";
export const NO_NEIGHBORHOOD = "Sin barrio";

export type DispatchItem = {
  name: string;
  /** "KILO" | "LIBRA": no se suman kilos con libras. */
  presentation: string;
  quantity: number;
};

export type DispatchOrder = {
  id: string;
  orderNumber: number;
  clientName: string;
  locality: string | null;
  neighborhood: string | null;
  address: string | null;
  total: number;
  items: DispatchItem[];
};

export type NeighborhoodGroup = { neighborhood: string; orders: DispatchOrder[] };

export type LocalityGroup = {
  locality: string;
  neighborhoods: NeighborhoodGroup[];
  orderCount: number;
  total: number;
};

const collator = new Intl.Collator("es", { sensitivity: "base" });

/** Alfabético, pero lo que no tiene dato va siempre al final. */
function compareWithFallbackLast(a: string, b: string, fallback: string): number {
  if (a === fallback && b !== fallback) return 1;
  if (b === fallback && a !== fallback) return -1;
  return collator.compare(a, b);
}

/** Texto comparable: "ENGATIVA " y "Engativá" son la misma localidad. */
function localityKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function groupByLocality(orders: readonly DispatchOrder[]): LocalityGroup[] {
  // La primera escritura de cada localidad fija cómo se muestra.
  const localities = new Map<string, { label: string; byNeighborhood: Map<string, NeighborhoodGroup> }>();

  for (const order of orders) {
    const label = order.locality?.trim() || NO_LOCALITY;
    const key = localityKey(label);
    const entry = localities.get(key) ?? { label, byNeighborhood: new Map() };
    localities.set(key, entry);

    const neighborhood = order.neighborhood?.trim() || NO_NEIGHBORHOOD;
    const nKey = localityKey(neighborhood);
    const group = entry.byNeighborhood.get(nKey) ?? { neighborhood, orders: [] };
    group.orders.push(order);
    entry.byNeighborhood.set(nKey, group);
  }

  return [...localities.values()]
    .map(({ label, byNeighborhood }) => {
      const neighborhoods = [...byNeighborhood.values()]
        .sort((a, b) => compareWithFallbackLast(a.neighborhood, b.neighborhood, NO_NEIGHBORHOOD))
        .map((group) => ({
          ...group,
          orders: [...group.orders].sort((a, b) => a.orderNumber - b.orderNumber),
        }));
      const flat = neighborhoods.flatMap((group) => group.orders);

      return {
        locality: label,
        neighborhoods,
        orderCount: flat.length,
        total: flat.reduce((sum, order) => sum + order.total, 0),
      };
    })
    .sort((a, b) => compareWithFallbackLast(a.locality, b.locality, NO_LOCALITY));
}

export type PickLine = {
  name: string;
  presentation: string;
  quantity: number;
  /** De qué pedido sale cada porción: sirve para repartir en bodega. */
  orders: { orderNumber: number; clientName: string; quantity: number }[];
};

/** Modo alistamiento: cuánto de cada sabor hay que sacar para el día. */
export function buildPickList(orders: readonly DispatchOrder[]): PickLine[] {
  const lines = new Map<string, PickLine>();

  for (const order of orders) {
    for (const item of order.items) {
      const key = `${item.name}|${item.presentation}`;
      const line = lines.get(key) ?? {
        name: item.name,
        presentation: item.presentation,
        quantity: 0,
        orders: [],
      };
      line.quantity += item.quantity;

      const existing = line.orders.find((entry) => entry.orderNumber === order.orderNumber);
      if (existing) existing.quantity += item.quantity;
      else {
        line.orders.push({
          orderNumber: order.orderNumber,
          clientName: order.clientName,
          quantity: item.quantity,
        });
      }
      lines.set(key, line);
    }
  }

  return [...lines.values()]
    .map((line) => ({
      ...line,
      orders: line.orders.sort((a, b) => a.orderNumber - b.orderNumber),
    }))
    .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.presentation, b.presentation));
}

/** Google Maps admite origen, destino y hasta 9 paradas intermedias. */
export const MAX_MAPS_WAYPOINTS = 9;

/**
 * Enlace de Google Maps con el recorrido en el orden de la ruta. Las paradas
 * sin dirección se omiten. Devuelve null si no hay nada que navegar; si hay
 * más paradas de las que Maps admite, `truncated` avisa.
 */
export function googleMapsRoute(addresses: readonly (string | null | undefined)[]): {
  url: string;
  truncated: boolean;
} | null {
  const stops = addresses
    .map((address) => address?.trim())
    .filter((address): address is string => Boolean(address))
    .map((address) => (/bogot|soacha|mosquera|funza|madrid/i.test(address) ? address : `${address}, Bogotá`));

  if (stops.length === 0) return null;

  const maxStops = MAX_MAPS_WAYPOINTS + 1;
  const used = stops.slice(0, maxStops);
  const destination = used[used.length - 1];
  const waypoints = used.slice(0, -1);

  const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));

  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    truncated: stops.length > maxStops,
  };
}

/** Waze abre una sola dirección: se usa parada por parada. */
export function wazeLink(address: string | null | undefined): string | null {
  const text = address?.trim();
  if (!text) return null;

  const withCity = /bogot|soacha|mosquera|funza|madrid/i.test(text) ? text : `${text}, Bogotá`;
  return `https://waze.com/ul?q=${encodeURIComponent(withCity)}&navigate=yes`;
}
