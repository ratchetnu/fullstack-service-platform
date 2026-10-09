import { describe, expect, it } from "vitest";
import { authenticateSessionToken, login, logout } from "@/server/services/auth-service";
import { countRows, db, PASSWORDS, useDatabase } from "./helpers";

describe("authentication", () => {
  useDatabase();

  it("signs in with the right password and creates a server-side session", async () => {
    const result = await login({ email: "Staff@Example.test", password: PASSWORDS.staff });
    expect(result.user).toEqual({ id: expect.any(String), email: "staff@example.test", displayName: "Test staff", role: "staff" });
    expect(await authenticateSessionToken(result.token)).toEqual(result.user);
  });

  it("stores only a hash of the session token", async () => {
    const { token } = await login({ email: "staff@example.test", password: PASSWORDS.staff });
    const { rows } = await db().query(`SELECT encode(token_hash, 'hex') AS hash FROM sessions`);
    expect(rows).toHaveLength(1);
    expect(rows[0].hash).not.toContain(Buffer.from(token).toString("hex"));
    expect(rows[0].hash).toHaveLength(64);
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    const wrongPassword = login({ email: "staff@example.test", password: "nope" });
    const unknownEmail = login({ email: "nobody@example.test", password: "nope" });
    await expect(wrongPassword).rejects.toMatchObject({ status: 401, message: "Email or password is incorrect." });
    await expect(unknownEmail).rejects.toMatchObject({ status: 401, message: "Email or password is incorrect." });
  });

  it("rejects expired sessions", async () => {
    const { token } = await login({ email: "staff@example.test", password: PASSWORDS.staff });
    await db().query(`UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second'`);
    expect(await authenticateSessionToken(token)).toBeNull();
  });

  it("revokes the session on sign out", async () => {
    const { token } = await login({ email: "admin@example.test", password: PASSWORDS.admin });
    await logout(token);
    expect(await authenticateSessionToken(token)).toBeNull();
    expect(await countRows("sessions")).toBe(0);
  });

  it("ignores made-up tokens", async () => {
    expect(await authenticateSessionToken("forged-token")).toBeNull();
    expect(await authenticateSessionToken(undefined)).toBeNull();
  });
});
