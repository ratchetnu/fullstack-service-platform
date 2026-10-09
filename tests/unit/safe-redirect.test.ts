import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/shared/safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps local paths", () => {
    expect(safeRedirectPath("/bookings?status=scheduled")).toBe("/bookings?status=scheduled");
  });

  it.each(["https://evil.test", "//evil.test/path", "/\\evil.test", "javascript:alert(1)", "", null, undefined])(
    "falls back for %s",
    (target) => {
      expect(safeRedirectPath(target)).toBe("/dashboard");
    },
  );
});
