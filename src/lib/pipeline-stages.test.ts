import { describe, expect, it } from "vitest";
import {
  ALL_STAGES,
  CLOSED_STAGES,
  OPEN_STAGES,
  isClosedStage,
  shouldActivateClient,
  stageTransitionFields,
} from "./pipeline-stages";

describe("etapas", () => {
  it("separa abiertas de cerradas sin solaparlas", () => {
    expect(OPEN_STAGES).toHaveLength(4);
    expect(CLOSED_STAGES).toEqual(["GANADA", "PERDIDA"]);
    expect(ALL_STAGES).toHaveLength(6);
    expect(OPEN_STAGES.some((s) => CLOSED_STAGES.includes(s))).toBe(false);
  });

  it("identifica las etapas de cierre", () => {
    expect(isClosedStage("GANADA")).toBe(true);
    expect(isClosedStage("PERDIDA")).toBe(true);
    expect(isClosedStage("NEGOCIACION")).toBe(false);
    expect(isClosedStage("PROSPECTO")).toBe(false);
  });
});

describe("stageTransitionFields", () => {
  const now = new Date("2026-09-01T10:00:00Z");

  it("estampa la fecha al ganar, sin motivo de pérdida", () => {
    expect(stageTransitionFields("GANADA", undefined, now)).toEqual({
      closedAt: now,
      lostReason: null,
    });
  });

  it("guarda el motivo al perder", () => {
    expect(stageTransitionFields("PERDIDA", "Precio alto", now)).toEqual({
      closedAt: now,
      lostReason: "Precio alto",
    });
  });

  it("descarta el motivo si la etapa no es PERDIDA", () => {
    expect(stageTransitionFields("GANADA", "Precio alto", now).lostReason).toBeNull();
  });

  it("limpia cierre y motivo al reabrir la oportunidad", () => {
    // Una oportunidad que vuelve a estar viva no debe arrastrar el
    // "perdida por X" de su cierre anterior.
    for (const stage of OPEN_STAGES) {
      expect(stageTransitionFields(stage, "Precio alto", now)).toEqual({
        closedAt: null,
        lostReason: null,
      });
    }
  });
});

describe("shouldActivateClient", () => {
  it("activa al cliente que seguía como prospecto al ganar", () => {
    expect(shouldActivateClient("GANADA", "PROSPECTO")).toBe(true);
  });

  it("no toca a un cliente que ya estaba activo", () => {
    expect(shouldActivateClient("GANADA", "ACTIVO")).toBe(false);
  });

  it("no reactiva a un cliente suspendido ni inactivo", () => {
    expect(shouldActivateClient("GANADA", "SUSPENDIDO")).toBe(false);
    expect(shouldActivateClient("GANADA", "INACTIVO")).toBe(false);
  });

  it("no activa a nadie en etapas que no son GANADA", () => {
    for (const stage of [...OPEN_STAGES, "PERDIDA" as const]) {
      expect(shouldActivateClient(stage, "PROSPECTO")).toBe(false);
    }
  });
});
