import "server-only";
import { fieldErrors, loginSchema } from "@/shared/schemas";
import { getDummyPasswordHash, verifyPassword } from "../auth/password";
import type { AuthUser } from "../auth/policy";
import { generateSessionToken, hashSessionToken } from "../auth/session-token";
import { getConfig } from "../config";
import { getPool } from "../db/pool";
import { errors } from "../errors";
import * as users from "../repositories/users";

export interface LoginResult {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

export async function login(body: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) throw errors.validation(fieldErrors(parsed.error));
  const { email, password } = parsed.data;
  const pool = getPool();

  const user = await users.findUserWithPasswordByEmail(pool, email);
  // Always run the (slow) password check so an unknown email takes as long as a wrong password.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyPasswordHash()));
  if (!user || !valid) throw errors.unauthenticated("Email or password is incorrect.");

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + getConfig().sessionTtlHours * 3_600_000);
  await users.deleteExpiredSessions(pool, user.id);
  await users.insertSession(pool, { userId: user.id, tokenHash: hashSessionToken(token), expiresAt });

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return { user: publicUser, token, expiresAt };
}

export async function authenticateSessionToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  return users.findUserBySessionTokenHash(getPool(), hashSessionToken(token));
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await users.deleteSessionByTokenHash(getPool(), hashSessionToken(token));
}
