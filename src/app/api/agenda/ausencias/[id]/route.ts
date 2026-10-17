import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { noContent, route } from "@/server/http";
import { deleteBlock } from "@/server/services/visit-schedules";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** DELETE /api/agenda/ausencias/:id */
export const DELETE = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  await deleteBlock(user, id);

  return noContent();
});
