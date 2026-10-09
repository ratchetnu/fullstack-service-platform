import { describe, expect, it } from "vitest";
import { type AuthUser, hasPermission, requirePermission } from "@/server/auth/policy";

const staff: AuthUser = { id: "1", email: "s@example.com", displayName: "S", role: "staff" };
const admin: AuthUser = { ...staff, id: "2", role: "admin" };

describe("authorization policy", () => {
  it("lets staff read and progress jobs, but not cancel", () => {
    expect(hasPermission(staff, "bookings:read")).toBe(true);
    expect(hasPermission(staff, "jobs:progress")).toBe(true);
    expect(hasPermission(staff, "jobs:cancel")).toBe(false);
  });

  it("lets admins do everything staff can, plus cancel", () => {
    expect(hasPermission(admin, "jobs:progress")).toBe(true);
    expect(hasPermission(admin, "jobs:cancel")).toBe(true);
  });

  it("distinguishes 'not signed in' (401) from 'not allowed' (403)", () => {
    expect(thrownBy(() => requirePermission(null, "bookings:read"))).toMatchObject({ status: 401 });
    expect(thrownBy(() => requirePermission(staff, "jobs:cancel"))).toMatchObject({ status: 403 });
    expect(() => requirePermission(admin, "jobs:cancel")).not.toThrow();
  });
});

function thrownBy(fn: () => void): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to throw");
}
