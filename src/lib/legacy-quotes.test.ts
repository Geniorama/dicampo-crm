import { describe, expect, it } from "vitest";
import {
  flavorKey,
  groupLegacyQuotes,
  parseDiscountPercent,
  parseLegacyDate,
  parseLegacyNit,
  parseMoney,
  totalsAgree,
  type LegacyRow,
} from "./legacy-quotes";

const row = (flavor: string, kilos: number, price: string, subtotal: string): LegacyRow => ({
  "N° Cotización": "COT-20260513-009",
  Fecha: "13/05/2026",
  Cliente: "Manuel Vicente Mendoza Moreno",
  "Tipo cliente": "Distribuidor",
  Contacto: "Manuel Mendoza",
  Teléfono: "316 - 3070929",
  Asesor: "Luis",
  Sabor: flavor,
  Kilos: kilos,
  "Precio kilo": price,
  "Subtotal línea": subtotal,
  "Total cotización": "$278.214",
  NIT: "NIT  79992751 - 6",
  "Forma facturación": "Factura",
  Descuento: "Promo 15% primer pedido",
});

describe("lectura de celdas del Excel", () => {
  it("dinero con punto de miles", () => {
    expect(parseMoney("$20.350")).toBe(20_350);
    expect(parseMoney("$1.024.513")).toBe(1_024_513);
    expect(parseMoney(20_350)).toBe(20_350);
    expect(parseMoney("")).toBe(0);
  });

  it("fechas dd/mm/aaaa sin saltos de día", () => {
    expect(parseLegacyDate("13/05/2026")?.toISOString()).toBe("2026-05-13T12:00:00.000Z");
    expect(parseLegacyDate("no es fecha")).toBeNull();
  });

  it("NIT con y sin dígito de verificación", () => {
    expect(parseLegacyNit("NIT  79992751 - 6")).toBe("79992751");
    expect(parseLegacyNit("1.024.513.157")).toBe("1024513157");
    expect(parseLegacyNit("")).toBe("");
  });

  it("porcentaje del descuento", () => {
    expect(parseDiscountPercent("Promo 15% primer pedido")).toBe(15);
    expect(parseDiscountPercent("Sin descuento")).toBe(0);
  });

  it("los sabores del Excel apuntan al catálogo", () => {
    expect(flavorKey("Limonada de coco")).toBe(flavorKey("Limón Coco"));
    expect(flavorKey("Guanábana")).toBe(flavorKey("guanabana"));
    expect(flavorKey("Piña colada")).toBe(flavorKey("Piña Colada"));
  });
});

describe("groupLegacyQuotes", () => {
  const rows = [
    row("Maracuyá", 6, "$20.350", "$122.100"),
    row("Mango", 6, "$12.760", "$76.560"),
    row("Frutos amarillos", 2, "$15.675", "$31.350"),
    row("Mandarina", 3, "$19.250", "$57.750"),
    row("Lulo", 1, "$13.200", "$13.200"),
    row("Guanábana", 1, "$14.850", "$14.850"),
    row("Uva", 1, "$11.500", "$11.500"),
    // Fila de encabezado/nota que no es una cotización.
    { "N° Cotización": "N° Cotización", Fecha: "Fecha" },
  ];

  it("agrupa las líneas y descarta lo que no es cotización", () => {
    const { quotes, skippedRows } = groupLegacyQuotes(rows);

    expect(skippedRows).toBe(1);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].lines).toHaveLength(7);
    expect(quotes[0].phoneDigits).toBe("3163070929");
    expect(quotes[0].nitDigits).toBe("79992751");
    expect(quotes[0].billing).toBe("FACTURA");
    expect(quotes[0].discountPercent).toBe(15);
  });

  it("el total del Excel cuadra con las líneas y el descuento", () => {
    const [quote] = groupLegacyQuotes(rows).quotes;
    expect(totalsAgree(quote)).toBe(true);
    expect(totalsAgree({ ...quote, total: 300_000 })).toBe(false);
  });
});
