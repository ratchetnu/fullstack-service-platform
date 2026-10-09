/**
 * Generates a realistic-looking but entirely synthetic data set: about a month
 * of history and two weeks of upcoming work. Deterministic for a given "now",
 * so screenshots and demos are repeatable.
 */
import type { ClientBase } from "pg";
import { hashPassword } from "../src/server/auth/password";
import { BUSINESS } from "../src/shared/business-rules";
import type { JobStatus } from "../src/shared/job-status";
import { startTimesFor } from "../src/shared/scheduling";
import { addDays, getZonedParts, toLocalDate, zonedTimeToUtc } from "../src/shared/time";

export const DEMO_USERS = [
  { email: "admin@example.com", displayName: "Avery Admin", role: "admin", password: "admin-demo-password" },
  { email: "staff@example.com", displayName: "Sam Staff", role: "staff", password: "staff-demo-password" },
] as const;

export const SERVICES = [
  { code: "assessment", name: "On-site assessment", description: "A technician visits, inspects and gives a written quote.", duration: 60, price: 4900 },
  { code: "standard-visit", name: "Standard service visit", description: "Routine maintenance or a single repair.", duration: 120, price: 14900 },
  { code: "extended-visit", name: "Extended service visit", description: "Larger jobs that need a half day on site.", duration: 240, price: 32900 },
  { code: "follow-up", name: "Follow-up visit", description: "Return visit to finish or check earlier work.", duration: 60, price: 7900 },
] as const;

const FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Quinn", "Drew", "Reese", "Skyler", "Rowan", "Parker", "Hayden", "Emerson", "Finley", "Logan", "Peyton", "Sawyer", "Blair", "Cameron", "Dakota"];
const LAST_NAMES = ["Rivera", "Chen", "Patel", "Okafor", "Novak", "Silva", "Kim", "Haddad", "Larsen", "Moreau", "Tanaka", "Byrne", "Costa", "Mensah", "Ivanova", "Lindqvist", "Duarte", "Fischer", "Nakamura", "Osei"];
const STREETS = ["Maple Avenue", "Oak Street", "Cedar Lane", "Birch Road", "Willow Way", "Elm Court", "Pine Terrace", "Juniper Drive"];
const NOTES = ["Side gate is unlocked.", "Please call on arrival.", "Dog on the property — friendly.", "Parking available in the driveway.", null, null, null];
const CANCEL_REASONS = ["Customer rescheduled", "Customer no longer needs the work", "Access to the site was not possible"];

/** Small deterministic PRNG (mulberry32), so the seed is repeatable. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}

const TODAY_START_TIMES = ["08:00", "10:00", "14:00"];
const REFERENCE_ALPHABET = [..."0123456789ABCDEFGHJKMNPQRSTVWXYZ"];
const MINUTE = 60_000;

export async function seed(db: ClientBase, now: Date = new Date()): Promise<{ customers: number; bookings: number }> {
  const rng = random(20_240_601);

  const userIds: string[] = [];
  for (const user of DEMO_USERS) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, display_name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.email, user.displayName, user.role, await hashPassword(user.password)],
    );
    userIds.push(rows[0]!.id);
  }

  const services: { id: string; duration: number; price: number }[] = [];
  for (const service of SERVICES) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO services (code, name, description, duration_minutes, price_cents) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [service.code, service.name, service.description, service.duration, service.price],
    );
    services.push({ id: rows[0]!.id, duration: service.duration, price: service.price });
  }

  const customers: { id: string; name: string; phone: string }[] = [];
  for (let i = 0; i < 28; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
    const name = `${first} ${last}`;
    // 555-0100 to 555-0199 is reserved for fictional use in North America.
    const phone = `(202) 555-01${String(i).padStart(2, "0")}`;
    const createdAt = new Date(now.getTime() - rng.int(35, 120) * 1440 * MINUTE);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO customers (full_name, email, phone, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, `${first}.${last}${i}@example.com`.toLowerCase(), phone, createdAt],
    );
    customers.push({ id: rows[0]!.id, name, phone });
  }

  const today = toLocalDate(now, BUSINESS.timeZone);
  let bookingCount = 0;

  for (let offset = -30; offset <= 14; offset++) {
    const date = addDays(today, offset);
    const weekday = getZonedParts(zonedTimeToUtc(date, "12:00", BUSINESS.timeZone), BUSINESS.timeZone).weekday;
    if (!BUSINESS.openWeekdays.includes(weekday)) continue;

    // At most `crewCapacity` jobs per day, so the seed never exceeds capacity.
    // Today always has three jobs at fixed times, so during business hours the
    // dashboard shows a realistic mix of finished, running and upcoming work.
    const jobsToday = offset === 0 ? TODAY_START_TIMES.length : rng.int(1, BUSINESS.crewCapacity);
    const customersToday = new Set<string>();
    for (let n = 0; n < jobsToday; n++) {
      const service = offset === 0 ? services[1]! : rng.pick(services);
      const startTime = offset === 0 ? TODAY_START_TIMES[n]! : rng.pick(startTimesFor(service.duration));
      const start = zonedTimeToUtc(date, startTime, BUSINESS.timeZone);
      const end = new Date(start.getTime() + service.duration * MINUTE);
      let customer = rng.pick(customers);
      while (customersToday.has(customer.id)) customer = rng.pick(customers);
      customersToday.add(customer.id);
      const createdAt = new Date(Math.min(start.getTime() - rng.int(1, 10) * 1440 * MINUTE, now.getTime() - 60 * MINUTE));
      const actor = rng.pick(userIds);

      let status: JobStatus = "scheduled";
      if (end <= now) status = rng.next() < 0.86 ? "completed" : "cancelled";
      else if (start <= now) status = "in_progress";
      else if (rng.next() < 0.06) status = "cancelled";

      const startedAt = status === "in_progress" || status === "completed" ? new Date(start.getTime() + rng.int(-5, 10) * MINUTE) : null;
      const completedAt = status === "completed" ? new Date(Math.min(end.getTime() + rng.int(-10, 15) * MINUTE, now.getTime())) : null;
      const cancelledAt = status === "cancelled" ? new Date(Math.min(start.getTime() - 120 * MINUTE, now.getTime() - MINUTE)) : null;
      const cancellationReason = status === "cancelled" ? rng.pick(CANCEL_REASONS) : null;

      const reference = `BK-${Array.from({ length: 8 }, () => rng.pick(REFERENCE_ALPHABET)).join("")}`;
      const { rows: bookingRows } = await db.query<{ id: string }>(
        `INSERT INTO bookings (reference, customer_id, service_id, requested_start, contact_name, contact_phone, service_address,
                               notes, quoted_price_cents, idempotency_key, request_fingerprint, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'seed', $11) RETURNING id`,
        [reference, customer.id, service.id, start, customer.name, customer.phone,
         `${rng.int(10, 999)} ${rng.pick(STREETS)}, Springfield`, rng.pick(NOTES), service.price,
         `seed-${String(bookingCount).padStart(12, "0")}`, createdAt],
      );
      const { rows: jobRows } = await db.query<{ id: string }>(
        `INSERT INTO jobs (booking_id, status, scheduled_start, scheduled_end, started_at, completed_at, cancelled_at,
                           cancellation_reason, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING id`,
        [bookingRows[0]!.id, status, start, end, startedAt, completedAt, cancelledAt, cancellationReason,
         1 + (startedAt ? 1 : 0) + (completedAt || cancelledAt ? 1 : 0), createdAt],
      );

      const jobId = jobRows[0]!.id;
      const events: [JobStatus | null, JobStatus, string | null, Date, string | null][] = [
        [null, "scheduled", null, createdAt, "Booked online by customer"],
      ];
      if (startedAt) events.push(["scheduled", "in_progress", actor, startedAt, null]);
      if (completedAt) events.push(["in_progress", "completed", actor, completedAt, null]);
      if (cancelledAt) events.push([startedAt ? "in_progress" : "scheduled", "cancelled", userIds[0]!, cancelledAt, cancellationReason]);
      for (const [from, to, actorId, at, note] of events) {
        await db.query(
          `INSERT INTO job_status_events (job_id, from_status, to_status, actor_user_id, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [jobId, from, to, actorId, note, at],
        );
      }
      bookingCount++;
    }
  }

  return { customers: customers.length, bookings: bookingCount };
}
