import { describe, expect, it } from "vitest";
import { readCookie, serializeSessionCookie } from "@/server/auth/session-token";
import { errors } from "@/server/errors";
import { assertSameOrigin, errorResponse } from "@/server/http/route";

describe("errorResponse", () => {
  it("maps an AppError to its status and a stable JSON shape", async () => {
    const response = errorResponse(errors.validation({ date: "Bad date" }), "req-1");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fields: { date: "Bad date" }, requestId: "req-1" },
    });
  });

  it("hides the details of unexpected errors", async () => {
    const response = errorResponse(new Error("connection string postgres://secret@db"), "req-2");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

describe("assertSameOrigin", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://app.test/api/v1/bookings", { method: "POST", headers });

  it("allows same-origin browser requests", () => {
    expect(() => assertSameOrigin(request({ host: "app.test", origin: "http://app.test" }))).not.toThrow();
  });

  it("allows non-browser clients that send no Origin", () => {
    expect(() => assertSameOrigin(request({ host: "app.test" }))).not.toThrow();
  });

  it("rejects cross-site requests", () => {
    expect(() => assertSameOrigin(request({ host: "app.test", origin: "https://evil.test" }))).toThrow(
      "You do not have permission to do that.",
    );
  });

  it("rejects malformed origins", () => {
    expect(() => assertSameOrigin(request({ host: "app.test", origin: "null" }))).toThrow();
  });
});

describe("session cookies", () => {
  it("are HttpOnly and SameSite=Lax, and Secure when configured", () => {
    const cookie = serializeSessionCookie("tok", { expiresAt: new Date("2030-01-01T00:00:00Z"), secure: true });
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(serializeSessionCookie("tok", { expiresAt: new Date(), secure: false })).not.toContain("Secure");
  });

  it("can be read back from a Cookie header", () => {
    expect(readCookie("a=1; sp_session=abc; b=2", "sp_session")).toBe("abc");
    expect(readCookie("a=1", "sp_session")).toBeUndefined();
    expect(readCookie(null, "sp_session")).toBeUndefined();
  });
});
