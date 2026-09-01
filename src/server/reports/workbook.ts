import ExcelJS from "exceljs";

/**
 * Construcción del libro de Excel de reportes.
 *
 * Se centraliza aquí el formato para que todas las hojas se vean iguales:
 * encabezado con el verde de marca, fila de títulos congelada, autofiltro,
 * anchos calculados y montos con formato de moneda colombiana.
 */

/** Verde de marca de Dicampo, en el formato ARGB que espera Excel. */
const BRAND_GREEN = "FF5BB040";
const HEADER_TEXT = "FFFFFFFF";

/** Formato de moneda COP sin decimales, con separador de miles. */
const MONEY_FORMAT = '"$"#,##0';
const QUANTITY_FORMAT = "#,##0.###";
const DATE_FORMAT = "dd/mm/yyyy";

export type ColumnKind = "text" | "money" | "quantity" | "date" | "number";

export type SheetColumn<T> = {
  header: string;
  value: (row: T) => unknown;
  kind?: ColumnKind;
  /** Ancho fijo; si falta, se calcula del contenido. */
  width?: number;
};

export type Sheet<T> = {
  name: string;
  rows: readonly T[];
  columns: readonly SheetColumn<T>[];
  /** Nota que se imprime bajo la tabla, para explicar el contenido. */
  note?: string;
};

function numberFormatFor(kind: ColumnKind | undefined): string | undefined {
  switch (kind) {
    case "money":
      return MONEY_FORMAT;
    case "quantity":
      return QUANTITY_FORMAT;
    case "date":
      return DATE_FORMAT;
    default:
      return undefined;
  }
}

/**
 * Excel limita los nombres de hoja a 31 caracteres y prohíbe : \ / ? * [ ]
 * Un nombre inválido hace que el archivo no abra, así que se sanea siempre.
 */
function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
}

function addSheet<T>(workbook: ExcelJS.Workbook, sheet: Sheet<T>) {
  const worksheet = workbook.addWorksheet(safeSheetName(sheet.name), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = sheet.columns.map((column) => ({
    header: column.header,
    key: column.header,
    width: column.width ?? Math.min(40, Math.max(12, column.header.length + 4)),
    style: { numFmt: numberFormatFor(column.kind) },
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: HEADER_TEXT } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_GREEN },
  };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;

  for (const row of sheet.rows) {
    worksheet.addRow(sheet.columns.map((column) => column.value(row)));
  }

  // El autofiltro solo tiene sentido si hay algo que filtrar.
  if (sheet.rows.length > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };
  } else {
    worksheet.addRow(["Sin datos en el período seleccionado"]);
    worksheet.getRow(2).font = { italic: true, color: { argb: "FF888888" } };
  }

  // Se ensanchan las columnas al contenido más largo, con tope para que una
  // nota kilométrica no deje una columna de 200 caracteres.
  worksheet.columns.forEach((column, index) => {
    let longest = sheet.columns[index].header.length;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const length = String(cell.value ?? "").length;
      if (length > longest) longest = length;
    });
    column.width = sheet.columns[index].width ?? Math.min(45, longest + 3);
  });

  if (sheet.note) {
    const noteRow = worksheet.addRow([]);
    worksheet.addRow([sheet.note]);
    worksheet.getRow(noteRow.number + 1).font = {
      italic: true,
      size: 9,
      color: { argb: "FF888888" },
    };
  }

  return worksheet;
}

/** Hoja de portada con el período y el resumen del reporte. */
function addCoverSheet(
  workbook: ExcelJS.Workbook,
  meta: {
    generatedBy: string;
    generatedAt: Date;
    periodLabel: string;
    rangeFrom: Date;
    rangeTo: Date;
    summary: { label: string; value: string | number }[];
  },
) {
  const sheet = workbook.addWorksheet("Resumen");
  sheet.columns = [{ width: 32 }, { width: 26 }];

  const title = sheet.addRow(["Dicampo — Reportes"]);
  title.font = { bold: true, size: 16, color: { argb: BRAND_GREEN } };
  sheet.addRow([]);

  const details: [string, string][] = [
    ["Período", meta.periodLabel],
    [
      "Rango",
      `${meta.rangeFrom.toLocaleDateString("es-CO")} — ${meta.rangeTo.toLocaleDateString("es-CO")}`,
    ],
    ["Generado por", meta.generatedBy],
    ["Generado el", meta.generatedAt.toLocaleString("es-CO")],
  ];

  for (const [label, value] of details) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }

  sheet.addRow([]);
  const summaryTitle = sheet.addRow(["Resumen del período"]);
  summaryTitle.font = { bold: true, size: 12 };

  for (const item of meta.summary) {
    const row = sheet.addRow([item.label, item.value]);
    row.getCell(1).font = { bold: true };
  }

  sheet.addRow([]);
  const note = sheet.addRow([
    "Los pedidos cancelados no cuentan como venta, salvo en la hoja de pedidos detallados.",
  ]);
  note.font = { italic: true, size: 9, color: { argb: "FF888888" } };

  return sheet;
}

export type WorkbookSpec = {
  meta: Parameters<typeof addCoverSheet>[1];
  // Cada hoja tiene su propio tipo de fila; `unknown` las unifica sin perder
  // la seguridad dentro de cada definición.
  sheets: Sheet<never>[];
};

export async function buildWorkbook(spec: WorkbookSpec): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM Dicampo";
  workbook.created = spec.meta.generatedAt;

  addCoverSheet(workbook, spec.meta);
  for (const sheet of spec.sheets) {
    addSheet(workbook, sheet);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Ayuda a declarar una hoja conservando el tipo de sus filas. */
export function defineSheet<T>(sheet: Sheet<T>): Sheet<never> {
  return sheet as unknown as Sheet<never>;
}
