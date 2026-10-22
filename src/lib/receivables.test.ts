import { describe, expect, it } from "vitest";
import {
  agingBucket,
  bogotaDay,
  daysOverdue,
  dueDay,
  paymentStatusFor,
  summarizeClient,
} from "./receivables";

describe("fechas de cartera en hora de Bogotá", () => {
  it("una entrega a las 8 p. m. cuenta ese día, no el siguiente", () => {
    // 01:00 UTC del 2 de octubre = 8 p. m. del 1 de octubre en Bogotá.
    const delivered = new Date("2026-10-02T01:00:00Z");
    expect(bogotaDay(delivered)).toBe("2026-10-01");
    expect(dueDay(delivered, "CONTADO")).toBe("2026-10-01");
    expect(dueDay(delivered, "CREDITO_15")).toBe("2026-10-16");
  });

  it("el plazo cruza el fin de mes", () => {
    expect(dueDay(new Date("2026-10-25T17:00:00Z"), "CREDITO_8")).toBe("2026-11-02");
  });

  it("el día de vencimiento todavía no hay atraso", () => {
    expect(daysOverdue("2026-10-16", new Date("2026-10-16T22:00:00Z"))).toBe(0);
    expect(daysOverdue("2026-10-16", new Date("2026-10-17T17:00:00Z"))).toBe(1);
    expect(daysOverdue("2026-10-16", new Date("2026-10-10T17:00:00Z"))).toBe(0);
  });

  it("rangos de antigüedad", () => {
    expect(agingBucket(0)).toBe("AL_DIA");
    expect(agingBucket(30)).toBe("1_30");
    expect(agingBucket(31)).toBe("31_60");
    expect(agingBucket(61)).toBe("MAS_60");
  });
});

describe("estado de pago", () => {
  it("se deduce de lo pagado", () => {
    expect(paymentStatusFor(100_000, 0)).toBe("PENDIENTE");
    expect(paymentStatusFor(100_000, 40_000)).toBe("PARCIAL");
    expect(paymentStatusFor(100_000, 100_000)).toBe("PAGADO");
  });
});

describe("summarizeClient", () => {
  const now = new Date("2026-10-22T17:00:00Z");
  const deliveredOn = (iso: string) => new Date(`${iso}T17:00:00Z`);

  const result = summarizeClient(
    [
      { id: "a", total: 200_000, paid: 50_000, deliveredAt: deliveredOn("2026-10-01"), terms: "CREDITO_8" },
      { id: "b", total: 100_000, paid: 0, deliveredAt: deliveredOn("2026-10-20"), terms: "CREDITO_15" },
      { id: "c", total: 80_000, paid: 80_000, deliveredAt: deliveredOn("2026-09-01"), terms: "CONTADO" },
    ],
    now,
  );

  it("deja fuera lo ya pagado", () => {
    expect(result.orders.map((order) => order.id)).toEqual(["a", "b"]);
  });

  it("separa el saldo total del vencido", () => {
    // a venció el 9 de octubre (13 días de atraso); b vence el 4 de noviembre.
    expect(result.balance).toBe(150_000 + 100_000);
    expect(result.overdue).toBe(150_000);
    expect(result.maxOverdueDays).toBe(13);
  });

  it("ordena primero lo más vencido", () => {
    expect(result.orders[0].id).toBe("a");
  });
});
