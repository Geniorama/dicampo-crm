import ExcelJS from "exceljs";
import { buildTable, parseDelimited } from "@/lib/import/csv";
import type { ParsedTable } from "@/lib/import/types";
import { cleanText } from "@/lib/import/values";
import { ValidationError } from "../errors";

/**
 * Lectura del archivo que sube la persona.
 *
 * Se aceptan CSV (y cualquier texto delimitado) y XLSX. El .xls binario de
 * Excel 97-2003 **no**: ExcelJS no lo abre y añadir un lector de aquel
 * formato no se justifica cuando volver a guardarlo como .xlsx es un clic.
 * Se detecta y se dice con todas las letras, que es mejor que un error de
 * "archivo corrupto" diez segundos después.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Firma ZIP: todo .xlsx es un zip. */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
/** Firma OLE2: el .xls antiguo y otros documentos de Office 97. */
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Texto del archivo.
 *
 * Se intenta UTF-8 y, si aparecen caracteres de reemplazo, se reintenta con
 * Windows-1252: los CSV que salen de sistemas viejos vienen en ANSI y sin
 * ese segundo intento toda la carga llegaría con los acentos rotos.
 */
function decodeText(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("�")) return utf8;

  return new TextDecoder("windows-1252").decode(buffer);
}

/** Celda de Excel a texto plano, sea cual sea la forma en que venga. */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    // Fecha sin hora: ExcelJS la entrega en UTC y así la lee `parseDateValue`.
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    const cell = value as Record<string, unknown>;

    // Fórmula: interesa el resultado calculado, no la fórmula.
    if ("result" in cell) return cellToString(cell.result);
    // Celda con error (#N/A, #REF!): se trata como vacía.
    if ("error" in cell) return "";
    if ("richText" in cell && Array.isArray(cell.richText)) {
      return cell.richText
        .map((part) => cleanText((part as { text?: string }).text))
        .join("");
    }
    if ("text" in cell) return cleanText(cell.text);
    if ("hyperlink" in cell) return cleanText(cell.hyperlink);
  }

  return cleanText(value);
}

async function parseWorkbook(
  buffer: Buffer,
  maxRows: number,
  sheetName?: string,
): Promise<ParsedTable> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ValidationError(
      "No se pudo abrir el archivo de Excel. Verifica que no esté dañado ni protegido con contraseña.",
    );
  }

  const sheets = workbook.worksheets.map((worksheet) => worksheet.name);
  if (sheets.length === 0) {
    throw new ValidationError("El archivo de Excel no tiene ninguna hoja.");
  }

  const worksheet = sheetName
    ? workbook.worksheets.find((sheet) => sheet.name === sheetName)
    : // Sin hoja indicada se toma la primera con datos: es corriente que la
      // primera hoja del libro sea una portada vacía.
      (workbook.worksheets.find((sheet) => sheet.actualRowCount > 0) ??
      workbook.worksheets[0]);

  if (!worksheet) {
    throw new ValidationError(`El archivo no tiene una hoja "${sheetName}".`);
  }

  const width = worksheet.columnCount;
  const matrix: string[][] = [];

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let column = 1; column <= width; column += 1) {
      cells.push(cellToString(row.getCell(column).value));
    }
    matrix.push(cells);
  });

  return {
    ...buildTable(matrix, maxRows),
    sheetName: worksheet.name,
    sheets,
  };
}

/**
 * Convierte el archivo subido en una tabla con encabezados.
 *
 * `maxRows` acota lo que se carga: el sobrante se informa en `truncated` en
 * lugar de fallar, para que quien sube un archivo enorme sepa exactamente
 * cuántas filas quedaron fuera.
 */
export async function parseImportFile(
  file: File,
  options: { maxRows: number; sheet?: string },
): Promise<ParsedTable> {
  if (file.size === 0) {
    throw new ValidationError("El archivo está vacío.");
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new ValidationError(
      `El archivo pesa más de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. Divídelo en partes.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (startsWith(buffer, OLE2_SIGNATURE) || name.endsWith(".xls")) {
    throw new ValidationError(
      "El formato .xls (Excel 97-2003) no se puede leer. Ábrelo en Excel y usa Guardar como → Libro de Excel (.xlsx) o CSV.",
    );
  }

  if (startsWith(buffer, ZIP_SIGNATURE) || name.endsWith(".xlsx")) {
    return parseWorkbook(buffer, options.maxRows, options.sheet);
  }

  const table = parseDelimited(decodeText(buffer), { maxRows: options.maxRows });

  if (table.headers.length === 0) {
    throw new ValidationError("El archivo no tiene filas con datos.");
  }

  if (table.headers.length === 1) {
    throw new ValidationError(
      "Solo se reconoció una columna. Revisa que el archivo use punto y coma, coma o tabulación como separador.",
    );
  }

  return table;
}
