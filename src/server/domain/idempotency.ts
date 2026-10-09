import { createHash } from "node:crypto";

/** JSON with object keys sorted, so logically equal values always serialise the same way. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * A fingerprint of the validated request. If a client reuses an idempotency
 * key, we compare fingerprints to tell a genuine retry (same request) from a
 * mistake (a different request sent with an old key).
 */
export function requestFingerprint(validatedRequest: unknown): string {
  return createHash("sha256").update(stableStringify(validatedRequest)).digest("hex");
}
