import type { Role } from "@/shared/types";
import type { AuthUser } from "../auth/policy";
import type { Queryable } from "../db/pool";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: Role;
}

function toUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
}

export async function findUserWithPasswordByEmail(
  db: Queryable,
  email: string,
): Promise<(AuthUser & { passwordHash: string }) | null> {
  const { rows } = await db.query<UserRow & { password_hash: string }>(
    `SELECT id, email, display_name, role, password_hash FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ? { ...toUser(rows[0]), passwordHash: rows[0].password_hash } : null;
}

export async function insertSession(
  db: Queryable,
  session: { userId: string; tokenHash: Buffer; expiresAt: Date },
): Promise<void> {
  await db.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [
    session.userId,
    session.tokenHash,
    session.expiresAt,
  ]);
}

export async function findUserBySessionTokenHash(db: Queryable, tokenHash: Buffer): Promise<AuthUser | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT u.id, u.email, u.display_name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function deleteSessionByTokenHash(db: Queryable, tokenHash: Buffer): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

export async function deleteExpiredSessions(db: Queryable, userId: string): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()`, [userId]);
}
