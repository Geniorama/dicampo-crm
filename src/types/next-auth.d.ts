import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/generated/prisma/enums";

/**
 * Extiende los tipos de Auth.js con el rol de Dicampo, para que
 * `session.user.role` esté tipado en toda la aplicación.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
  }
}
