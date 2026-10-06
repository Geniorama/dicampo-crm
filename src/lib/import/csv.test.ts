import { describe, expect, it } from "vitest";
import { buildTable, detectDelimiter, parseDelimited } from "./csv";

const options = { maxRows: 100 };

describe("detectDelimiter", () => {
  it("reconoce el punto y coma de Excel en español", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });

  it("reconoce la coma y la tabulación", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("no se deja engañar por los separadores dentro de comillas", () => {
    // Una sola coma de verdad frente a tres encerradas entre comillas.
    const text = 'razon;"Uno, dos, tres, cuatro"\notra;"a, b"';

    expect(detectDelimiter(text)).toBe(";");
  });
});

describe("parseDelimited", () => {
  it("separa encabezados y filas", () => {
    const table = parseDelimited("Nombre;NIT\nEl Trigo;900123456", options);

    expect(table.headers).toEqual(["Nombre", "NIT"]);
    expect(table.rows).toEqual([["El Trigo", "900123456"]]);
    expect(table.delimiter).toBe(";");
  });

  it("descarta el BOM que Excel necesita al abrir", () => {
    const table = parseDelimited("﻿Nombre;NIT\nEl Trigo;900", options);

    expect(table.headers[0]).toBe("Nombre");
  });

  it("respeta las comillas: separadores y saltos de línea dentro de una celda", () => {
    const table = parseDelimited(
      'Nombre;Dirección\n"Trigo, S.A.";"Calle 53\nApto 201"',
      options,
    );

    expect(table.rows[0][0]).toBe("Trigo, S.A.");
    expect(table.rows[0][1]).toBe("Calle 53\nApto 201");
  });

  it("interpreta las comillas dobles como comilla literal", () => {
    const table = parseDelimited('Nombre\n"El ""Trigo"""', options);

    expect(table.rows[0][0]).toBe('El "Trigo"');
  });

  it("deshace el apóstrofe con que nuestro exportador neutraliza fórmulas", () => {
    const table = parseDelimited("Nombre;Nota\nEl Trigo;'=SUMA(A1)", options);

    expect(table.rows[0][1]).toBe("=SUMA(A1)");
  });

  it("iguala el ancho de las filas cortas al del encabezado", () => {
    const table = parseDelimited("a;b;c\n1;2", options);

    expect(table.rows[0]).toEqual(["1", "2", ""]);
  });

  it("ignora las líneas en blanco del final", () => {
    const table = parseDelimited("a;b\n1;2\n\n\n", options);

    expect(table.rows).toHaveLength(1);
  });

  it("informa de las filas que quedan fuera del tope", () => {
    const text = ["a;b", "1;1", "2;2", "3;3"].join("\n");

    const table = parseDelimited(text, { maxRows: 2 });

    expect(table.rows).toHaveLength(2);
    expect(table.truncated).toBe(1);
  });
});

describe("buildTable", () => {
  it("salta el título suelto que muchas hojas traen encima", () => {
    const table = buildTable(
      [
        ["LISTADO DE CLIENTES", "", ""],
        ["Nombre", "NIT", "Teléfono"],
        ["El Trigo", "900123456", "3101234567"],
      ],
      100,
    );

    expect(table.headers).toEqual(["Nombre", "NIT", "Teléfono"]);
    expect(table.rows).toHaveLength(1);
  });

  it("desambigua los encabezados repetidos y nombra los vacíos", () => {
    const table = buildTable([["Teléfono", "Teléfono", ""]], 100);

    expect(table.headers).toEqual(["Teléfono", "Teléfono (2)", "Columna 3"]);
  });
});
