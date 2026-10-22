import type { Metadata } from "next";
import { requireAdminPage } from "@/server/guards";
import { prisma } from "@/server/db";
import { listGoals } from "@/server/services/goals";
import { goalMonthQuerySchema } from "@/server/validators/goals";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { GoalsEditor, type GoalRow } from "@/components/goals/goals-editor";
import { currentMonth } from "@/lib/goals";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Metas" };

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdminPage();

  const parsed = goalMonthQuerySchema.safeParse(flattenSearchParams(await searchParams));
  const month = (parsed.success && parsed.data.mes) || currentMonth();

  const [goals, advisors] = await Promise.all([
    listGoals(month),
    prisma.user.findMany({
      where: { active: true, role: "VENDEDOR" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const byUser = new Map(goals.map((goal) => [goal.userId, goal]));
  const row = (userId: string | null, label: string): GoalRow => ({
    userId,
    label,
    salesTarget: byUser.get(userId)?.salesTarget ?? 0,
    newClientsTarget: byUser.get(userId)?.newClientsTarget ?? 0,
  });

  const rows = [
    row(null, "Meta general"),
    ...advisors.map((advisor) => row(advisor.id, advisor.name)),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Metas mensuales"
        description="Ventas en pesos y clientes nuevos, por asesor y en general. Un cliente nuevo es el que hace su primer pedido en el mes."
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div>
            <label htmlFor="mes" className="text-xs font-medium text-muted-foreground">
              Mes
            </label>
            <Input id="mes" name="mes" type="month" defaultValue={month} className="mt-1" />
          </div>
          <Button type="submit" variant="secondary">
            Ver mes
          </Button>
        </form>

        <GoalsEditor key={month} month={month} rows={rows} />
      </Card>
    </div>
  );
}
