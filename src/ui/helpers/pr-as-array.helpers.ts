// Coerces a possibly-missing list field to an array (anything that isn't
// an array becomes []). Typed list fields keep their element type.
export function asArray<T>(value: readonly T[] | null | undefined): T[];
export function asArray(value: unknown): unknown[];
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
