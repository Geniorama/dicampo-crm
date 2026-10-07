import { describe, expect, it } from "vitest";
import {
  AGENT_STAGES,
  agentStageBlocker,
  describeInterest,
  mergeInterest,
  pickSeller,
  stageAfterVisit,
  valueInterest,
  withInterestBlock,
  type PricedVariant,
} from "./agent-rules";

describe("pickSeller", () => {
  const day = (n: number) => new Date(2026, 9, n);

  it("asigna al vendedor con menos prospectos", () => {
    expect(
      pickSeller([
        { id: "a", prospectCount: 5, lastAssignedAt: day(1) },
        { id: "b", prospectCount: 2, lastAssignedAt: day(6) },
        { id: "c", prospectCount: 3, lastAssignedAt: null },
      ]),
    ).toBe("b");
  });

  it("en empate, al que lleva más tiempo sin recibir uno", () => {
    expect(
      pickSeller([
        { id: "a", prospectCount: 2, lastAssignedAt: day(5) },
        { id: "b", prospectCount: 2, lastAssignedAt: day(2) },
      ]),
    ).toBe("b");
  });

  it("quien nunca recibió un lead va primero en el empate", () => {
    expect(
      pickSeller([
        { id: "a", prospectCount: 0, lastAssignedAt: day(1) },
        { id: "b", prospectCount: 0, lastAssignedAt: null },
      ]),
    ).toBe("b");
  });

  it("desempata por id para ser estable", () => {
    expect(
      pickSeller([
        { id: "z", prospectCount: 0, lastAssignedAt: null },
        { id: "m", prospectCount: 0, lastAssignedAt: null },
      ]),
    ).toBe("m");
  });

  it("devuelve null si no hay vendedores", () => {
    expect(pickSeller([])).toBeNull();
  });
});

describe("agentStageBlocker", () => {
  it("permite las tres etapas intermedias", () => {
    expect(AGENT_STAGES).toEqual(["CONTACTADO", "MUESTRA_ENVIADA", "NEGOCIACION"]);
    for (const stage of AGENT_STAGES) {
      expect(agentStageBlocker("PROSPECTO", stage)).toBeNull();
    }
    // Retroceder entre etapas abiertas también se permite, como en el tablero.
    expect(agentStageBlocker("NEGOCIACION", "CONTACTADO")).toBeNull();
  });

  it("nunca deja ganar, perder ni volver a PROSPECTO", () => {
    expect(agentStageBlocker("NEGOCIACION", "GANADA")).toMatch(/solo puede/);
    expect(agentStageBlocker("NEGOCIACION", "PERDIDA")).toMatch(/solo puede/);
    expect(agentStageBlocker("CONTACTADO", "PROSPECTO")).toMatch(/solo puede/);
  });

  it("no toca oportunidades cerradas", () => {
    expect(agentStageBlocker("GANADA", "NEGOCIACION")).toMatch(/cerrada/);
    expect(agentStageBlocker("PERDIDA", "CONTACTADO")).toMatch(/cerrada/);
  });
});

describe("stageAfterVisit", () => {
  it("avanza desde PROSPECTO y no retrocede", () => {
    expect(stageAfterVisit("PROSPECTO")).toBe("CONTACTADO");
    expect(stageAfterVisit("CONTACTADO")).toBe("CONTACTADO");
    expect(stageAfterVisit("NEGOCIACION")).toBe("NEGOCIACION");
  });
});

describe("valueInterest", () => {
  const variants = new Map<string, PricedVariant>([
    ["MAN-K", { id: "v1", sku: "MAN-K", label: "Pulpa de Mango (kilo)", netWeightG: 1000 }],
    ["MAN-L", { id: "v2", sku: "MAN-L", label: "Pulpa de Mango (libra)", netWeightG: 500 }],
    ["UVA-K", { id: "v3", sku: "UVA-K", label: "Pulpa de Uva (kilo)", netWeightG: 1000 }],
  ]);
  const prices: Record<string, number> = { v1: 15952, v2: 8500 };
  const unitPriceFor = (id: string) => prices[id] ?? null;

  it("pasa kilos a unidades y suma el valor mensual", () => {
    const result = valueInterest(
      [
        { sku: "MAN-K", kilosPerMonth: 20 },
        { sku: "MAN-L", kilosPerMonth: 5 },
      ],
      variants,
      unitPriceFor,
    );

    expect(result.lines[0]).toMatchObject({ units: 20, subtotal: 319040 });
    // 5 kg en libras de 500 g = 10 unidades
    expect(result.lines[1]).toMatchObject({ units: 10, subtotal: 85000 });
    expect(result.total).toBe(404040);
    expect(result.withoutPrice).toEqual([]);
  });

  it("usa el escalón según las unidades, no los kilos", () => {
    const calls: number[] = [];
    valueInterest([{ sku: "MAN-L", kilosPerMonth: 3 }], variants, (_id, units) => {
      calls.push(units);
      return 1;
    });
    expect(calls).toEqual([6]);
  });

  it("no suma variantes sin precio y las informa", () => {
    const result = valueInterest(
      [
        { sku: "MAN-K", kilosPerMonth: 1 },
        { sku: "UVA-K", kilosPerMonth: 10 },
      ],
      variants,
      unitPriceFor,
    );
    expect(result.total).toBe(15952);
    expect(result.withoutPrice).toEqual(["UVA-K"]);
    expect(result.lines[1]).toMatchObject({ unitPrice: null, subtotal: 0 });
  });

  it("falla con un SKU que no está en el mapa", () => {
    expect(() =>
      valueInterest([{ sku: "XXX-K", kilosPerMonth: 1 }], variants, unitPriceFor),
    ).toThrow(/XXX-K/);
  });
});

describe("mergeInterest", () => {
  it("normaliza el SKU y suma repetidos", () => {
    expect(
      mergeInterest([
        { sku: "man-k", kilosPerMonth: 10 },
        { sku: " MAN-K ", kilosPerMonth: 5 },
        { sku: "UVA-K", kilosPerMonth: 2 },
      ]),
    ).toEqual([
      { sku: "MAN-K", kilosPerMonth: 15 },
      { sku: "UVA-K", kilosPerMonth: 2 },
    ]);
  });
});

describe("describeInterest", () => {
  it("escribe una línea por producto, marcando lo que no tiene precio", () => {
    const money = (n: number) => `$${n}`;
    expect(
      describeInterest(
        [
          { sku: "MAN-K", label: "Mango", kilosPerMonth: 20, units: 20, unitPrice: 100, subtotal: 2000 },
          { sku: "UVA-K", label: "Uva", kilosPerMonth: 1.5, units: 1.5, unitPrice: null, subtotal: 0 },
        ],
        money,
      ),
    ).toBe("Mango: 20 kg/mes × $100 = $2000\nUva: 1,5 kg/mes (sin precio en la lista)");
  });
});

describe("withInterestBlock", () => {
  it("agrega el bloque de interés a notas vacías o del agente", () => {
    expect(withInterestBlock(null, "Mango: 20 kg")).toBe(
      "— Interés declarado por WhatsApp —\nMango: 20 kg",
    );
    expect(withInterestBlock("Usa fresa", "Fresa: 5 kg")).toBe(
      "Usa fresa\n\n— Interés declarado por WhatsApp —\nFresa: 5 kg",
    );
  });

  it("reemplaza solo el bloque anterior y conserva lo del vendedor", () => {
    const first = withInterestBlock("Llamar el lunes", "Fresa: 5 kg");
    expect(withInterestBlock(first, "Fresa: 30 kg")).toBe(
      "Llamar el lunes\n\n— Interés declarado por WhatsApp —\nFresa: 30 kg",
    );
  });
});
