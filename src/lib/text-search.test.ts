import { describe, expect, it } from "vitest";
import { matchesTerms, normalizeSearch, searchTerms } from "./text-search";

const haystack = normalizeSearch("Panadería El Trigo SAS");

describe("búsqueda tolerante", () => {
  it("ignora mayúsculas y tildes", () => {
    expect(matchesTerms(haystack, searchTerms("PANADERIA"))).toBe(true);
    expect(matchesTerms(haystack, searchTerms("panadería"))).toBe(true);
    expect(matchesTerms(normalizeSearch("Frutería Ñapa"), searchTerms("napa"))).toBe(true);
  });

  it("filtra desde la primera letra", () => {
    expect(matchesTerms(haystack, searchTerms("p"))).toBe(true);
    expect(matchesTerms(haystack, searchTerms("x"))).toBe(false);
  });

  it("exige todas las palabras, en cualquier orden", () => {
    expect(matchesTerms(haystack, searchTerms("trigo pan"))).toBe(true);
    expect(matchesTerms(haystack, searchTerms("trigo maíz"))).toBe(false);
  });

  it("una consulta vacía lo muestra todo", () => {
    expect(searchTerms("   ")).toEqual([]);
    expect(matchesTerms(haystack, [])).toBe(true);
  });
});
