import { randomUUID } from "node:crypto";
import { afterAll, beforeEach } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { closePool, getPool } from "@/server/db/pool";
import { login } from "@/server/services/auth-service";
import { BUSINESS } from "@/shared/business-rules";
import { addDays, getZonedParts, toLocalDate, zonedTimeToUtc } from "@/shared/time";

export const db = () => getPool();

export interface Fixtures {
  services: { assessment: string; standard: string; retired: string };
  users: { admin: string; staff: string };
}

const PASSWORDS = { admin: "admin-password-for-tests", staff: "staff-password-for-tests" };
let passwordHashes: Promise<Record<"admin" | "staff", string>> | undefined;

/** Empties every table and inserts a small, known set of services and users. */
export async function resetDatabase(): Promise<Fixtures> {
  const pool = getPool();
  await pool.query(
    "TRUNCATE job_status_events, jobs, bookings, customers, sessions, users, services RESTART IDENTITY CASCADE",
  );

  const insertService = async (code: string, duration: number, price: number, active = true) => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO services (code, name, duration_minutes, price_cents, active) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [code, `Test ${code}`, duration, price, active],
    );
    return rows[0]!.id;
  };

  passwordHashes ??= Promise.all([hashPassword(PASSWORDS.admin), hashPassword(PASSWORDS.staff)]).then(
    ([admin, staff]) => ({ admin, staff }),
  );
  const hashes = await passwordHashes;
  const insertUser = async (role: "admin" | "staff") => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${role}@example.test`, `Test ${role}`, role, hashes[role]],
    );
    return rows[0]!.id;
  };

  return {
    services: {
      assessment: await insertService("assessment", 60, 4900),
      standard: await insertService("standard", 120, 14900),
      retired: await insertService("retired", 60, 1000, false),
    },
    users: { admin: await insertUser("admin"), staff: await insertUser("staff") },
  };
}

/** Registers reset-before-each and close-pool-after-all for a test file. */
export function useDatabase(): () => Fixtures {
  let fixtures: Fixtures | undefined;
  beforeEach(async () => {
    fixtures = await resetDatabase();
  });
  afterAll(async () => {
    await closePool();
  });
  return () => {
    if (!fixtures) throw new Error("fixtures not ready");
    return fixtures;
  };
}

/** A business day at least `minDaysAhead` days from now (never a Sunday). */
export function openDate(minDaysAhead = 7): string {
  let date = addDays(toLocalDate(new Date(), BUSINESS.timeZone), minDaysAhead);
  while (!BUSINESS.openWeekdays.includes(getZonedParts(zonedTimeToUtc(date, "12:00", BUSINESS.timeZone), BUSINESS.timeZone).weekday)) {
    date = addDays(date, 1);
  }
  return date;
}

export function bookingRequest(serviceId: string, overrides: Record<string, unknown> = {}) {
  return {
    serviceId,
    date: openDate(),
    startTime: "10:00",
    customer: { fullName: "Jordan Example", email: "jordan@example.test", phone: "555-0100" },
    serviceAddress: "12 Sample Street, Springfield",
    notes: "Side gate is open.",
    ...overrides,
  };
}

export const newKey = () => randomUUID();

export async function sessionCookieFor(role: "admin" | "staff"): Promise<string> {
  const { token } = await login({ email: `${role}@example.test`, password: PASSWORDS[role] });
  return `sp_session=${token}`;
}

export async function countRows(table: "customers" | "bookings" | "jobs" | "job_status_events" | "sessions"): Promise<number> {
  const { rows } = await getPool().query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0]!.count;
}

export { PASSWORDS };
