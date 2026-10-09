import { describe, expect, it } from "vitest";
import { requestFingerprint, stableStringify } from "@/server/domain/idempotency";

describe("request fingerprints", () => {
  it("ignores key order", () => {
    expect(requestFingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(requestFingerprint({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it("ignores undefined fields, like JSON does", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("changes when any value changes", () => {
    expect(requestFingerprint({ date: "2026-06-03" })).not.toBe(requestFingerprint({ date: "2026-06-04" }));
  });

  it("preserves array order", () => {
    expect(stableStringify([2, 1])).toBe("[2,1]");
  });
});
