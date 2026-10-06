import { OpportunityStage } from "@/generated/prisma/enums";
import { OPPORTUNITY_STAGE_LABEL } from "@/lib/labels";
import { prisma } from "../../db";
import {
  changeOpportunityStage,
  createOpportunity,
  updateOpportunity,
} from "../../services/pipeline";
import {
  opportunityCreateSchema,
  opportunityStageSchema,
  opportunityUpdateSchema,
} from "../../validators/pipeline";
import {
  loadClientIndex,
  loadUserIndex,
  requireClient,
  resolveUser,
  type ClientIndex,
  type UserIndex,
} from "../context";
import {
  comparisonKey,
  compact,
  dateValue,
  decimal,
  digits,
  enumValue,
  requiredText,
  text,
  type RowRecord,
} from "../helpers";
import type { Importer, ProcessOptions, RowResult } from "../runner";

/**
 * Carga masiva de oportunidades del pipeline.
 *
 * La etapa no se escribe a pelo: se pasa por `changeOpportunityStage`, que es
 * donde viven las reglas del embudo — perder exige motivo, cerrar estampa la
 * fecha y ganar activa al cliente si seguía como prospecto. Por eso una fila
 * que llega "Ganada" nace en Prospecto y se mueve acto seguido: son dos
 * escrituras, pero las consecuencias comerciales quedan iguales que si
 * alguien la hubiera arrastrado en el tablero.
 */

type Ctx = { clients: ClientIndex; users: UserIndex };

export const opportunitiesImporter: Importer<Ctx> = {
  async load() {
    const [clients, users] = await Promise.all([
      loadClientIndex(),
      loadUserIndex(),
    ]);

    return { clients, users };
  },

  async process(
    record: RowRecord,
    ctx: Ctx,
    options: ProcessOptions,
  ): Promise<RowResult> {
    const client = requireClient(ctx.clients, {
      nit: digits(text(record, "clientNit")),
      name: text(record, "clientName"),
    });

    const title = requiredText(record, "title", "Título");
    const label = `${title} · ${client.businessName}`;

    const current = await prisma.opportunity.findMany({
      where: { clientId: client.id },
      select: { id: true, title: true, stage: true },
    });

    const existing = current.find(
      (row) => comparisonKey(row.title) === comparisonKey(title),
    );

    if (existing && options.mode === "crear") {
      return { action: "omitir", label, message: "Ya existe esa oportunidad." };
    }
    if (!existing && options.mode === "actualizar") {
      return { action: "omitir", label, message: "Todavía no existe." };
    }

    const stage = enumValue(record, "stage", OPPORTUNITY_STAGE_LABEL, "Etapa");
    const owner = resolveUser(ctx.users, text(record, "ownerRef"));

    const payload = {
      title,
      estimatedValue: decimal(record, "estimatedValue", "Valor estimado"),
      ownerId: owner?.id,
      expectedCloseDate: dateValue(record, "expectedCloseDate", "Cierre estimado"),
      notes: text(record, "notes"),
    };

    // El cambio de etapa se valida siempre, incluso en simulación: es donde
    // se descubre que media hoja marcada como perdida no dice por qué.
    const stageInput =
      stage && stage !== existing?.stage
        ? opportunityStageSchema.parse({
            stage,
            lostReason: text(record, "lostReason"),
          })
        : null;

    if (existing) {
      const input = opportunityUpdateSchema.parse(compact(payload));

      if (!options.dryRun) {
        await updateOpportunity(options.user, existing.id, input);
        if (stageInput) {
          await changeOpportunityStage(options.user, existing.id, stageInput);
        }
      }

      return { action: "actualizar", label, message: describeStage(stage) };
    }

    const input = opportunityCreateSchema.parse(
      compact({ ...payload, clientId: client.id }),
    );

    if (!options.dryRun) {
      const opportunity = await createOpportunity(options.user, input);
      if (stageInput) {
        await changeOpportunityStage(options.user, opportunity.id, stageInput);
      }
    }

    return { action: "crear", label, message: describeStage(stage) };
  },
};

function describeStage(stage: OpportunityStage | undefined): string {
  return stage
    ? OPPORTUNITY_STAGE_LABEL[stage]
    : OPPORTUNITY_STAGE_LABEL[OpportunityStage.PROSPECTO];
}
