import { describe, expect, it } from "vitest";
import { Presentation } from "@/generated/prisma/enums";
import { buildSku } from "./catalog";

describe("buildSku", () => {
  it("genera el SKU de un sabor simple", () => {
    expect(buildSku("Mango", Presentation.KILO)).toBe("MANGO-K");
    expect(buildSku("Mango", Presentation.LIBRA)).toBe("MANGO-L");
  });

  it("elimina las tildes", () => {
    expect(buildSku("Maracuyá", Presentation.KILO)).toBe("MARACU-K");
    expect(buildSku("Guanábana", Presentation.KILO)).toBe("GUANAB-K");
  });

  it("descarta espacios y recorta a seis letras", () => {
    expect(buildSku("Limón Hierbabuena", Presentation.KILO)).toBe("LIMONH-K");
    expect(buildSku("Frutos Rojos", Presentation.KILO)).toBe("FRUTOS-K");
  });
});
