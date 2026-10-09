/** Small helpers shared by the repositories. */

/** Builds an ILIKE "contains" pattern, escaping the user's own % and _ characters. */
export function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function iso(value: Date): string;
export function iso(value: Date | null): string | null;
export function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
