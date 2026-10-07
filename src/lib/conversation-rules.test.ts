import { describe, expect, it } from "vitest";
import {
  MAX_FOLLOW_UPS,
  baseMime,
  canFollowUp,
  detectPolicyKeyword,
  followUpAfterAgentMessage,
  followUpAfterFollowUpSent,
  followUpAfterInbound,
  isMediaPathOf,
  mediaPath,
  nextDeliveryStatus,
  serviceWindow,
} from "./conversation-rules";

const at = new Date("2026-10-07T12:00:00Z");
const hoursLater = (h: number) => new Date(at.getTime() + h * 3600_000);

describe("serviceWindow", () => {
  it("está abierta durante 24 h desde el último entrante", () => {
    expect(serviceWindow(at, hoursLater(23))).toEqual({ open: true, closesAt: hoursLater(24) });
    expect(serviceWindow(at, hoursLater(24)).open).toBe(false);
  });

  it("está cerrada si el cliente nunca escribió", () => {
    expect(serviceWindow(null, at)).toEqual({ open: false, closesAt: null });
  });
});

describe("seguimientos", () => {
  it("el mensaje del agente programa el primero a las 24 h", () => {
    expect(followUpAfterAgentMessage(at)).toEqual({
      followUpCount: 0,
      nextFollowUpAt: hoursLater(24),
    });
  });

  it("los siguientes caen a las 72 h y a los 6 días del mensaje original", () => {
    const first = followUpAfterFollowUpSent(0, hoursLater(24));
    expect(first).toEqual({ followUpCount: 1, nextFollowUpAt: hoursLater(72) });

    const second = followUpAfterFollowUpSent(1, hoursLater(72));
    expect(second).toEqual({ followUpCount: 2, nextFollowUpAt: hoursLater(144) });

    const third = followUpAfterFollowUpSent(2, hoursLater(144));
    expect(third).toEqual({ followUpCount: MAX_FOLLOW_UPS, nextFollowUpAt: null });
  });

  it("nunca pasa de tres", () => {
    expect(followUpAfterFollowUpSent(3, at)).toEqual({ followUpCount: 3, nextFollowUpAt: null });
  });

  it("una respuesta del prospecto cancela los pendientes", () => {
    expect(followUpAfterInbound()).toEqual({ followUpCount: 0, nextFollowUpAt: null });
  });

  it("solo con autorización comercial, sin baja, sin descarte y en BOT", () => {
    const ok = {
      status: "BOT",
      marketingConsentAt: at,
      optOutAt: null,
      disqualifiedAt: null,
      followUpCount: 0,
    };
    expect(canFollowUp(ok)).toBe(true);
    expect(canFollowUp({ ...ok, marketingConsentAt: null })).toBe(false);
    expect(canFollowUp({ ...ok, optOutAt: at })).toBe(false);
    expect(canFollowUp({ ...ok, disqualifiedAt: at })).toBe(false);
    expect(canFollowUp({ ...ok, status: "HUMANO" })).toBe(false);
    expect(canFollowUp({ ...ok, followUpCount: 3 })).toBe(false);
  });
});

describe("detectPolicyKeyword", () => {
  it("reconoce las instrucciones de la política sin importar tildes ni mayúsculas", () => {
    expect(detectPolicyKeyword("DEJAR DE RECIBIR MENSAJES")).toBe("BAJA");
    expect(detectPolicyKeyword("  dejar de recibir mensajes. ")).toBe("BAJA");
    expect(detectPolicyKeyword("Cancelar")).toBe("BAJA");
    expect(detectPolicyKeyword("Eliminar mis datos")).toBe("ELIMINAR_DATOS");
  });

  it("no confunde frases normales con una baja", () => {
    expect(detectPolicyKeyword("quiero cancelar el pedido")).toBeNull();
    expect(detectPolicyKeyword("hola")).toBeNull();
    expect(detectPolicyKeyword(null)).toBeNull();
  });
});

describe("nextDeliveryStatus", () => {
  it("solo avanza", () => {
    expect(nextDeliveryStatus(null, "sent")).toBe("sent");
    expect(nextDeliveryStatus("sent", "read")).toBe("read");
    expect(nextDeliveryStatus("read", "delivered")).toBeNull();
    expect(nextDeliveryStatus("delivered", "delivered")).toBeNull();
  });

  it("un fallo es definitivo", () => {
    expect(nextDeliveryStatus("sent", "failed")).toBe("failed");
    expect(nextDeliveryStatus("failed", "read")).toBeNull();
  });
});

describe("multimedia", () => {
  it("arma la ruta por teléfono y mes con extensión según el tipo", () => {
    expect(baseMime("audio/ogg; codecs=opus")).toBe("audio/ogg");
    expect(mediaPath("573001234567", "audio/ogg; codecs=opus", "wamid.HBg=", at)).toBe(
      "573001234567/2026-10/wamid_HBg_.ogg",
    );
    expect(() => mediaPath("57300", "video/mp4", "x", at)).toThrow(/no permitido/);
  });

  it("no acepta rutas de otro teléfono ni que escapen de la carpeta", () => {
    expect(isMediaPathOf("573001234567", "573001234567/2026-10/a.ogg")).toBe(true);
    expect(isMediaPathOf("573001234567", "573009999999/2026-10/a.ogg")).toBe(false);
    expect(isMediaPathOf("573001234567", "573001234567/../573009999999/a.ogg")).toBe(false);
  });
});
