import { describe, expect, it } from "vitest";
import { IMPORT_ENTITIES } from "./entities";
import {
  missingRequired,
  readMappedRow,
  scoreMatch,
  suggestMapping,
  unmappedColumns,
} from "./mapping";
import { COLUMN_PREFIX, CONSTANT_PREFIX } from "./types";

const clientes = IMPORT_ENTITIES.clientes;

describe("scoreMatch", () => {
  it("puntúa más alto cuanto más exacta es la coincidencia", () => {
    expect(scoreMatch("Razón social", "razon social")).toBe(100);
    // Dos palabras de tres explicadas pesan más que una de tres.
    expect(scoreMatch("Teléfono del contacto", "telefono contacto")).toBe(70);
    expect(scoreMatch("Teléfono del contacto", "telefono")).toBe(60);
    expect(scoreMatch("Telefono1", "telefono")).toBe(60);
  });

  it("no cuela coincidencias cortas por contenido", () => {
    // "nit" dentro de "unitario" sería el desastre clásico del cotejo
    // automático: el precio unitario acabaría en la columna del NIT.
    expect(scoreMatch("Valor unitario", "nit")).toBe(0);
  });
});

describe("suggestMapping", () => {
  it("cuadra los encabezados con los que viene una hoja de verdad", () => {
    const headers = [
      "Razón social",
      "NIT",
      "Tipo",
      "Celular",
      "Correo",
      "Dirección",
      "Barrio",
      "Contacto",
      "Cupo",
    ];

    const mapping = suggestMapping(headers, clientes.fields);

    expect(mapping.businessName).toBe(`${COLUMN_PREFIX}0`);
    expect(mapping.nit).toBe(`${COLUMN_PREFIX}1`);
    expect(mapping.type).toBe(`${COLUMN_PREFIX}2`);
    expect(mapping.phone).toBe(`${COLUMN_PREFIX}3`);
    expect(mapping.email).toBe(`${COLUMN_PREFIX}4`);
    expect(mapping.address).toBe(`${COLUMN_PREFIX}5`);
    expect(mapping.neighborhood).toBe(`${COLUMN_PREFIX}6`);
    expect(mapping.contactFirstName).toBe(`${COLUMN_PREFIX}7`);
    expect(mapping.creditLimit).toBe(`${COLUMN_PREFIX}8`);
  });

  it("no asigna la misma columna a dos campos", () => {
    const headers = ["Empresa", "Teléfono", "Teléfono del contacto"];

    const mapping = suggestMapping(headers, clientes.fields);
    const used = Object.values(mapping);

    expect(new Set(used).size).toBe(used.length);
    expect(mapping.phone).toBe(`${COLUMN_PREFIX}1`);
    expect(mapping.contactPhone).toBe(`${COLUMN_PREFIX}2`);
  });

  it("deja sin cotejar lo que no reconoce", () => {
    const mapping = suggestMapping(["Columna rara", "Otra cosa"], clientes.fields);

    expect(mapping.businessName).toBeUndefined();
    expect(missingRequired(mapping, clientes.fields).map((f) => f.key)).toEqual([
      "businessName",
    ]);
  });
});

describe("unmappedColumns", () => {
  it("lista las columnas del archivo que no se usarán", () => {
    const headers = ["Razón social", "Vendedor anterior", "Observación interna"];
    const mapping = { businessName: `${COLUMN_PREFIX}0` };

    expect(unmappedColumns(headers, mapping)).toEqual([
      "Vendedor anterior",
      "Observación interna",
    ]);
  });
});

describe("readMappedRow", () => {
  it("toma cada campo de su columna", () => {
    const record = readMappedRow(["El Trigo", "900123456"], {
      businessName: `${COLUMN_PREFIX}0`,
      nit: `${COLUMN_PREFIX}1`,
    });

    expect(record).toEqual({ businessName: "El Trigo", nit: "900123456" });
  });

  it("aplica el valor fijo a la fila", () => {
    const record = readMappedRow(["El Trigo"], {
      businessName: `${COLUMN_PREFIX}0`,
      status: `${CONSTANT_PREFIX}PROSPECTO`,
    });

    expect(record.status).toBe("PROSPECTO");
  });

  it("ignora los campos sin origen y las columnas que no existen", () => {
    const record = readMappedRow(["El Trigo"], {
      businessName: `${COLUMN_PREFIX}0`,
      notes: "",
      phone: `${COLUMN_PREFIX}9`,
    });

    expect(record.notes).toBeUndefined();
    expect(record.phone).toBe("");
  });
});
