import type { JobStatus } from "@/shared/job-status";
import type { BookingConfirmation, BookingDetail, BookingListItem } from "@/shared/types";
import type { Queryable } from "../db/pool";
import { containsPattern, iso } from "./sql";

export async function findBookingByIdempotencyKey(
  db: Queryable,
  idempotencyKey: string,
): Promise<{ id: string; requestFingerprint: string } | null> {
  const { rows } = await db.query<{ id: string; request_fingerprint: string }>(
    `SELECT id, request_fingerprint FROM bookings WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return rows[0] ? { id: rows[0].id, requestFingerprint: rows[0].request_fingerprint } : null;
}

export interface NewBooking {
  reference: string;
  customerId: string;
  serviceId: string;
  requestedStart: Date;
  contactName: string;
  contactPhone: string | null;
  serviceAddress: string;
  notes: string | null;
  quotedPriceCents: number;
  idempotencyKey: string;
  requestFingerprint: string;
}

export async function insertBooking(db: Queryable, booking: NewBooking): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookings (reference, customer_id, service_id, requested_start, contact_name, contact_phone,
                           service_address, notes, quoted_price_cents, idempotency_key, request_fingerprint)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      booking.reference,
      booking.customerId,
      booking.serviceId,
      booking.requestedStart,
      booking.contactName,
      booking.contactPhone,
      booking.serviceAddress,
      booking.notes,
      booking.quotedPriceCents,
      booking.idempotencyKey,
      booking.requestFingerprint,
    ],
  );
  return rows[0]!.id;
}

export async function getBookingConfirmation(db: Queryable, bookingId: string): Promise<BookingConfirmation | null> {
  const { rows } = await db.query<{
    id: string;
    reference: string;
    service_name: string;
    scheduled_start: Date;
    scheduled_end: Date;
    status: JobStatus;
  }>(
    `SELECT b.id, b.reference, s.name AS service_name, j.scheduled_start, j.scheduled_end, j.status
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN jobs j ON j.booking_id = b.id
      WHERE b.id = $1`,
    [bookingId],
  );
  const row = rows[0];
  return row
    ? {
        bookingId: row.id,
        reference: row.reference,
        serviceName: row.service_name,
        scheduledStart: iso(row.scheduled_start),
        scheduledEnd: iso(row.scheduled_end),
        status: row.status,
      }
    : null;
}

export interface BookingFilter {
  status?: JobStatus | undefined;
  search?: string | undefined;
  customerId?: string | undefined;
  scheduledFrom?: Date | undefined;
  scheduledBefore?: Date | undefined;
  order?: "schedule_desc" | "schedule_asc" | "created_desc";
  limit: number;
  offset?: number;
}

const ORDER_BY: Record<NonNullable<BookingFilter["order"]>, string> = {
  schedule_desc: "j.scheduled_start DESC, b.id",
  schedule_asc: "j.scheduled_start ASC, b.id",
  created_desc: "b.created_at DESC, b.id",
};

interface BookingListRow {
  booking_id: string;
  reference: string;
  customer_id: string;
  customer_name: string;
  service_name: string;
  scheduled_start: Date;
  status: JobStatus;
  quoted_price_cents: number;
  created_at: Date;
}

export async function listBookings(
  db: Queryable,
  filter: BookingFilter,
): Promise<{ items: (BookingListItem & { createdAt: string })[]; total: number }> {
  const params = [
    filter.status ?? null,
    filter.search ? containsPattern(filter.search) : null,
    filter.customerId ?? null,
    filter.scheduledFrom ?? null,
    filter.scheduledBefore ?? null,
  ];
  const where = `
        ($1::job_status IS NULL OR j.status = $1)
    AND ($2::text IS NULL OR b.reference ILIKE $2 OR c.full_name ILIKE $2 OR c.email ILIKE $2)
    AND ($3::uuid IS NULL OR b.customer_id = $3)
    AND ($4::timestamptz IS NULL OR j.scheduled_start >= $4)
    AND ($5::timestamptz IS NULL OR j.scheduled_start < $5)`;
  const from = `
     FROM bookings b
     JOIN customers c ON c.id = b.customer_id
     JOIN services s ON s.id = b.service_id
     JOIN jobs j ON j.booking_id = b.id`;

  const [list, count] = await Promise.all([
    db.query<BookingListRow>(
      `SELECT b.id AS booking_id, b.reference, c.id AS customer_id, c.full_name AS customer_name,
              s.name AS service_name, j.scheduled_start, j.status, b.quoted_price_cents, b.created_at
       ${from}
       WHERE ${where}
       ORDER BY ${ORDER_BY[filter.order ?? "schedule_desc"]}
       LIMIT $6 OFFSET $7`,
      [...params, filter.limit, filter.offset ?? 0],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total ${from} WHERE ${where}`, params),
  ]);

  return {
    items: list.rows.map((row) => ({
      bookingId: row.booking_id,
      reference: row.reference,
      customerId: row.customer_id,
      customerName: row.customer_name,
      serviceName: row.service_name,
      scheduledStart: iso(row.scheduled_start),
      status: row.status,
      quotedPriceCents: row.quoted_price_cents,
      createdAt: iso(row.created_at),
    })),
    total: count.rows[0]?.total ?? 0,
  };
}

export async function getBookingDetail(
  db: Queryable,
  bookingId: string,
): Promise<Omit<BookingDetail, "history"> | null> {
  const { rows } = await db.query<{
    booking_id: string;
    reference: string;
    created_at: Date;
    contact_name: string;
    contact_phone: string | null;
    service_address: string;
    notes: string | null;
    quoted_price_cents: number;
    customer_id: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    service_id: string;
    service_name: string;
    duration_minutes: number;
    job_id: string;
    status: JobStatus;
    version: number;
    scheduled_start: Date;
    scheduled_end: Date;
    started_at: Date | null;
    completed_at: Date | null;
    cancelled_at: Date | null;
    cancellation_reason: string | null;
  }>(
    `SELECT b.id AS booking_id, b.reference, b.created_at, b.contact_name, b.contact_phone,
            b.service_address, b.notes, b.quoted_price_cents,
            c.id AS customer_id, c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
            s.id AS service_id, s.name AS service_name, s.duration_minutes,
            j.id AS job_id, j.status, j.version, j.scheduled_start, j.scheduled_end,
            j.started_at, j.completed_at, j.cancelled_at, j.cancellation_reason
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       JOIN services s ON s.id = b.service_id
       JOIN jobs j ON j.booking_id = b.id
      WHERE b.id = $1`,
    [bookingId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    bookingId: row.booking_id,
    reference: row.reference,
    createdAt: iso(row.created_at),
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    serviceAddress: row.service_address,
    notes: row.notes,
    quotedPriceCents: row.quoted_price_cents,
    customer: { id: row.customer_id, fullName: row.customer_name, email: row.customer_email, phone: row.customer_phone },
    service: { id: row.service_id, name: row.service_name, durationMinutes: row.duration_minutes },
    job: {
      id: row.job_id,
      status: row.status,
      version: row.version,
      scheduledStart: iso(row.scheduled_start),
      scheduledEnd: iso(row.scheduled_end),
      startedAt: iso(row.started_at),
      completedAt: iso(row.completed_at),
      cancelledAt: iso(row.cancelled_at),
      cancellationReason: row.cancellation_reason,
    },
  };
}
