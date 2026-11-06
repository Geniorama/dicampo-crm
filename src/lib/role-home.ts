/**
 * Pantalla de inicio de cada rol. Quien entra a una página que su rol no
 * permite vuelve aquí, no al tablero: un domiciliario no ve el tablero y
 * redirigirlo allí lo dejaría en un bucle.
 */
export function homePathForRole(role: string): string {
  switch (role) {
    case "BODEGA":
      return "/pedidos";
    case "DESPACHO":
      return "/mi-ruta";
    case "COMPRAS":
      return "/compras";
    default:
      return "/dashboard";
  }
}
