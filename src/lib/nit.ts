/**
 * Dígito de verificación del NIT (algoritmo de la DIAN).
 *
 * Se multiplica cada dígito del NIT, leído de derecha a izquierda, por un peso
 * fijo; el residuo de la suma módulo 11 determina el DV.
 */

const WEIGHTS = [
  3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71,
];

/** Deja solo los dígitos: "900.123.456-7" → "9001234567" */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Calcula el dígito de verificación de un NIT.
 * Devuelve `null` si el NIT no es válido (vacío o demasiado largo).
 */
export function calculateNitDv(nit: string): string | null {
  const digits = onlyDigits(nit);
  if (digits.length === 0 || digits.length > WEIGHTS.length) return null;

  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    // De derecha a izquierda: el último dígito lleva el primer peso.
    const digit = Number(digits[digits.length - 1 - i]);
    sum += digit * WEIGHTS[i];
  }

  const remainder = sum % 11;
  const dv = remainder > 1 ? 11 - remainder : remainder;
  return String(dv);
}

/** Verifica que un NIT y su dígito de verificación sean coherentes. */
export function isValidNit(nit: string, dv: string): boolean {
  const expected = calculateNitDv(nit);
  return expected !== null && expected === onlyDigits(dv);
}
