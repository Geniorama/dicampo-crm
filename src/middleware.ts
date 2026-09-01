import NextAuth from "next-auth";
import { authConfig } from "@/server/auth.config";

/**
 * Protege toda la aplicación: sin sesión, Auth.js redirige a /login.
 * Usa `auth.config.ts` (sin Prisma) porque el middleware corre en Edge.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     * Se evalúan todas las rutas salvo:
     * - /api/*         ver nota abajo
     * - /_next/*       (estáticos y optimización de imágenes)
     * - archivos con extensión (favicon, imágenes, etc.)
     *
     * La API queda FUERA del middleware a propósito. Redirigir un endpoint a
     * /login devuelve HTML con estado 307, y quien llama espera JSON: el
     * cliente rompería al parsear la respuesta en vez de ver "inicia sesión".
     * Cada handler llama a `requireUser()`, que lanza UnauthorizedError y
     * `route()` traduce a un 401 con cuerpo JSON.
     */
    "/((?!api|_next/static|_next/image|.*\\.[\\w]+$).*)",
  ],
};
