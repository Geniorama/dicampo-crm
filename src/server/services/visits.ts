import { prisma } from "../db";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../errors";
import type { SessionUser } from "../guards";
import { ActivityType, ClientStatus, OpportunityStage, UserRole, VisitCategory } from "@/generated/prisma/enums";
import { NEW_CLIENT_VISIT_TITLE, VISIT_REASON_LABEL } from "@/lib/labels";
import { addAddress, addContact, createClient } from "./clients";
import { createActivity, createOpportunity } from "./pipeline";
import type { VisitCreateInput } from "../validators/visits";

/**
 * Una visita se registra como oportunidad en "Cita programada" más una
 * actividad VISITA pendiente en la agenda de quien la hace. No pide valor
 * mensual ni fecha de cierre: eso se define después, al cotizar.
 */

/** "AAAA-MM-DD" + "HH:mm" en hora de Bogotá (UTC-5, sin horario de verano). */
function bogotaMoment(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-05:00`);
}

export async function createVisit(user: SessionUser, input: VisitCreateInput) {
  const dueAt = bogotaMoment(input.visitDate, input.visitTime);
  if (Number.isNaN(dueAt.getTime())) {
    throw new BusinessRuleError("La fecha u hora de la visita no es válida.");
  }

  let clientId: string;
  let title: string;
  // Demostración a un negocio nuevo; fidelización a un cliente actual.
  const defaultCategory: VisitCategory =
    input.kind === "NUEVO" ? VisitCategory.DEMOSTRACION : VisitCategory.FIDELIZACION;
  const notes: string[] = [];

  if (input.kind === "NUEVO") {
    // El negocio todavía no existe: se crea como prospecto, con su contacto y sede.
    const client = await createClient(user, {
      businessName: input.businessName,
      type: "OTRO",
      status: ClientStatus.PROSPECTO,
      paymentTerms: "CONTADO",
      billingMode: "FACTURA",
      creditLimit: 0,
    });
    clientId = client.id;
    title = NEW_CLIENT_VISIT_TITLE;

    await addContact(user, clientId, {
      firstName: input.contactName,
      isPrimary: true,
    });
    await addAddress(user, clientId, {
      label: "Principal",
      address: input.address,
      locality: input.locality,
      city: "Bogotá",
      isPrimary: true,
    });

    notes.push(
      `Contacto: ${input.contactName}`,
      `Localidad: ${input.locality}`,
      `Dirección: ${input.address}`,
      `Muestra: ${input.sampleQuantity} × ${input.sampleFlavor} (no descuenta inventario)`,
    );
  } else {
    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: {
        id: true,
        ownerId: true,
        addresses: {
          where: { active: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
          select: { locality: true, address: true },
        },
      },
    });
    if (!client) throw new NotFoundError("El cliente");
    if (user.role === UserRole.VENDEDOR && client.ownerId !== user.id) {
      throw new ForbiddenError("Este cliente no está en tu cartera.");
    }

    clientId = client.id;
    title = VISIT_REASON_LABEL[input.reason];

    // Localidad y dirección salen de la base, no se digitan.
    const site = client.addresses[0];
    if (site) {
      if (site.locality) notes.push(`Localidad: ${site.locality}`);
      notes.push(`Dirección: ${site.address}`);
    }
  }

  const opportunity = await createOpportunity(user, {
    clientId,
    title,
    stage: OpportunityStage.CONTACTADO,
    estimatedValue: 0,
    visitCategory: input.category ?? defaultCategory,
    notes: notes.join("\n") || undefined,
  });

  await createActivity(user, {
    type: ActivityType.VISITA,
    subject: title,
    notes: notes.join("\n") || undefined,
    clientId,
    opportunityId: opportunity.id,
    dueAt,
    completed: false,
  });

  return opportunity;
}
