/**
 * These tests bypass the application and write SQL directly, to prove the
 * database itself refuses invalid data.
 */
import { describe, expect, it } from "vitest";
import { createBooking } from "@/server/services/booking-service";
import { bookingRequest, db, newKey, useDatabase } from "./helpers";

describe("database invariants", () => {
  const fixtures = useDatabase();

  async function jobId(): Promise<string> {
    const { booking } = await createBooking(bookingRequest(fixtures().services.standard), newKey());
    const { rows } = await db().query<{ id: string }>(`SELECT id FROM jobs WHERE booking_id = $1`, [booking.bookingId]);
    return rows[0]!.id;
  }

  it("blocks moving a job backwards, even with raw SQL", async () => {
    const id = await jobId();
    await db().query(`UPDATE jobs SET status = 'in_progress', started_at = now() WHERE id = $1`, [id]);
    await db().query(`UPDATE jobs SET status = 'completed', completed_at = now() WHERE id = $1`, [id]);
    await expect(
      db().query(`UPDATE jobs SET status = 'scheduled', started_at = NULL, completed_at = NULL WHERE id = $1`, [id]),
    ).rejects.toMatchObject({ code: "23514", constraint: "jobs_status_transition" });
  });

  it("blocks skipping a step (scheduled -> completed)", async () => {
    const id = await jobId();
    await expect(
      db().query(`UPDATE jobs SET status = 'completed', started_at = now(), completed_at = now() WHERE id = $1`, [id]),
    ).rejects.toMatchObject({ constraint: "jobs_status_transition" });
  });

  it("requires lifecycle timestamps to match the status", async () => {
    const id = await jobId();
    await expect(db().query(`UPDATE jobs SET status = 'in_progress' WHERE id = $1`, [id])).rejects.toMatchObject({
      constraint: "jobs_status_timestamps",
    });
  });

  it("requires a cancellation reason exactly when a job is cancelled", async () => {
    const id = await jobId();
    await expect(db().query(`UPDATE jobs SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [id])).rejects.toMatchObject({
      constraint: "jobs_cancellation_reason",
    });
    await expect(db().query(`UPDATE jobs SET cancellation_reason = 'why' WHERE id = $1`, [id])).rejects.toMatchObject({
      constraint: "jobs_cancellation_reason",
    });
  });

  it("requires a job to end after it starts", async () => {
    const id = await jobId();
    await expect(db().query(`UPDATE jobs SET scheduled_end = scheduled_start WHERE id = $1`, [id])).rejects.toMatchObject({
      constraint: "jobs_schedule_window",
    });
  });

  it("allows only one job per booking", async () => {
    const id = await jobId();
    await expect(
      db().query(
        `INSERT INTO jobs (booking_id, scheduled_start, scheduled_end)
         SELECT booking_id, scheduled_start, scheduled_end FROM jobs WHERE id = $1`,
        [id],
      ),
    ).rejects.toMatchObject({ constraint: "jobs_booking_id_unique" });
  });

  it("stores customer emails in lower case only, so uniqueness is case-insensitive", async () => {
    await expect(db().query(`INSERT INTO customers (full_name, email) VALUES ('A', 'Mixed@Case.test')`)).rejects.toMatchObject({
      constraint: "customers_email_lowercase",
    });
  });

  it("does not let a customer with bookings be deleted", async () => {
    await jobId();
    await expect(db().query(`DELETE FROM customers`)).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces unique idempotency keys", async () => {
    await jobId();
    await expect(
      db().query(
        `INSERT INTO bookings (reference, customer_id, service_id, requested_start, contact_name, service_address,
                               quoted_price_cents, idempotency_key, request_fingerprint)
         SELECT 'BK-OTHER001', customer_id, service_id, requested_start, contact_name, service_address,
                quoted_price_cents, idempotency_key, 'x'
           FROM bookings LIMIT 1`,
      ),
    ).rejects.toMatchObject({ constraint: "bookings_idempotency_key_unique" });
  });

  it("rejects negative prices and odd service durations", async () => {
    await expect(
      db().query(`INSERT INTO services (code, name, duration_minutes, price_cents) VALUES ('bad', 'Bad', 50, 100)`),
    ).rejects.toMatchObject({ constraint: "services_duration_range" });
    await expect(
      db().query(`INSERT INTO services (code, name, duration_minutes, price_cents) VALUES ('bad', 'Bad', 60, -1)`),
    ).rejects.toMatchObject({ constraint: "services_price_non_negative" });
  });
});
