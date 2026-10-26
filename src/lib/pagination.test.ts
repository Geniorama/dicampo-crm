import { describe, expect, it } from "vitest";
import { pageItems } from "./pagination";

describe("números del paginador", () => {
  it("con pocas páginas las muestra todas", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("al inicio abrevia el final", () => {
    expect(pageItems(1, 20)).toEqual([1, 2, "gap", 20]);
    expect(pageItems(3, 20)).toEqual([1, 2, 3, 4, "gap", 20]);
  });

  it("en el medio abrevia a ambos lados", () => {
    expect(pageItems(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
  });

  it("al final abrevia el inicio", () => {
    expect(pageItems(20, 20)).toEqual([1, "gap", 19, 20]);
  });

  it("un salto de una sola página se rellena con su número", () => {
    expect(pageItems(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
  });

  it("una página fuera de rango se acota", () => {
    expect(pageItems(99, 5)).toEqual([1, "gap", 4, 5]);
  });
});
