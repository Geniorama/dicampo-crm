import { handlers } from "@/server/auth";

// Prisma y bcrypt requieren el runtime de Node, no Edge.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
