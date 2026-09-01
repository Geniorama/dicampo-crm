import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/generated/prisma/enums";

/**
 * Configuración de Auth.js compartida entre el middleware y el servidor.
 *
 * El middleware de Next.js corre en el runtime Edge, donde no pueden usarse
 * Prisma ni bcrypt. Por eso este archivo no importa nada de la base de datos:
 * declara solo sesión, páginas y callbacks. El proveedor Credentials, que sí
 * consulta Postgres, se añade en `auth.ts` (runtime Node).
 */

/** Rutas accesibles sin sesión iniciada. */
const PUBLIC_ROUTES = ["/login"];

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    // El proveedor Credentials exige estrategia JWT: Auth.js no persiste
    // sesiones en base de datos para credenciales.
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8 horas: una jornada de trabajo
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
        // Quien ya inició sesión no debería volver a ver el login.
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", request.nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },

    jwt({ token, user }) {
      // `user` solo llega en el inicio de sesión; después se lee del token.
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.name = user.name;
      }
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
  // Se completa en auth.ts; el middleware no necesita proveedores.
  providers: [],
} satisfies NextAuthConfig;
