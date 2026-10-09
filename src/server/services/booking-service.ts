import "server-only";
import { BUSINESS } from "@/shared/business-rules";
import {
  createBookingSchema,
  fieldErrors,
  idempotencyKeySchema,
  type ListBookingsQuery,
  listBookingsQuerySchema,
} from "@/shared/schemas";
import { checkSchedule, type ScheduleViolationCode } from "@/shared/scheduling";
import type { BookingConfirmation, BookingDetail, BookingListItem, Page } from "@/shared/types";
import { type AuthUser, requirePermission } from "../auth/policy";
import { getPool, type Queryable } from "../db/pool";
import { withTransaction } from "../db/transaction";
import { requestFingerprint } from "../domain/idempotency";
import { generateBookingReference } from "../domain/reference";
import { errors, isUniqueViolation } from "../errors";
import { logger } from "../logger";
import * as bookings from "../repositories/bookings";
import { findOrCreateCustomer } from "../repositories/customers";
import * as jobs from "../repositories/jobs";
import { findServiceById } from "../repositories/services";
import { parseId } from "./ids";

export const PAGE_SIZE = 20;

export interface CreateBookingResult {
  booking: BookingConfirmation;
  /** True when this was a retry and the original booking was returned. */
  replayed: boolean;
}

const VIOLATION_FIELD: Record<ScheduleViolationCode, "date" | "startTime"> = {
  CLOSED_DAY: "date",
  TOO_FAR_AHEAD: "date",
  TOO_SOON: "startTime",
  OUTSIDE_BUSINESS_HOURS: "startTime",
};

/**
 * Turns a customer's booking request into a booking plus a scheduled job.
 *
 * Guarantees:
 * - All-or-nothing: the customer, booking, job and first status event are
 *   written in one transaction.
 * - Retry-safe: the same idempotency key always yields the same booking, even
 *   when retries arrive at the same moment.
 * - No overbooking: concurrent requests for the same day are serialised before
 *   capacity is checked.
 */
export async function createBooking(
  body: unknown,
  idempotencyKey: string | null,
  options: { now?: Date } = {},
): Promise<CreateBookingResult> {
  if (!idempotencyKey) throw errors.idempotencyKeyRequired();
  const key = idempotencyKeySchema.safeParse(idempotencyKey);
  if (!key.success) throw errors.idempotencyKeyRequired(key.error.issues[0]?.message);

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) throw errors.validation(fieldErrors(parsed.error));
  const input = parsed.data;
  const fingerprint = requestFingerprint(input);
  const now = options.now ?? new Date();

  // Fast path for retries: no transaction or locks needed.
  const earlier = await findReplay(getPool(), key.data, fingerprint);
  if (earlier) return earlier;

  try {
    return await withTransaction(async (tx) => {
      const service = await findServiceById(tx, input.serviceId);
      if (!service?.active) throw errors.validation({ serviceId: "This service is not available." });

      const schedule = checkSchedule({
        date: input.date,
        startTime: input.startTime,
        durationMinutes: service.durationMinutes,
        now,
      });
      if (!schedule.ok) {
        throw errors.businessRule(schedule.message, { [VIOLATION_FIELD[schedule.code]]: schedule.message });
      }

      await jobs.lockScheduleDay(tx, input.date);

      // Re-check now that we hold the lock: an identical request may have
      // committed while we were waiting for it.
      const replay = await findReplay(tx, key.data, fingerprint);
      if (replay) return replay;

      const busyCrews = await jobs.countActiveJobsOverlapping(tx, schedule.start, schedule.end);
      if (busyCrews >= BUSINESS.crewCapacity) throw errors.slotUnavailable();

      const customerId = await findOrCreateCustomer(tx, input.customer);
      const reference = generateBookingReference();
      const bookingId = await bookings.insertBooking(tx, {
        reference,
        customerId,
        serviceId: service.id,
        requestedStart: schedule.start,
        contactName: input.customer.fullName,
        contactPhone: input.customer.phone ?? null,
        serviceAddress: input.serviceAddress,
        notes: input.notes ?? null,
        quotedPriceCents: service.priceCents,
        idempotencyKey: key.data,
        requestFingerprint: fingerprint,
      });
      const job = await jobs.insertJob(tx, {
        bookingId,
        scheduledStart: schedule.start,
        scheduledEnd: schedule.end,
      });
      await jobs.insertStatusEvent(tx, {
        jobId: job.id,
        fromStatus: null,
        toStatus: "scheduled",
        actorUserId: null,
        note: "Booked online by customer",
      });

      logger.info("booking created", { bookingId, reference, jobId: job.id });
      return {
        replayed: false,
        booking: {
          bookingId,
          reference,
          serviceName: service.name,
          scheduledStart: job.scheduledStart,
          scheduledEnd: job.scheduledEnd,
          status: job.status,
        },
      };
    });
  } catch (error) {
    // Two requests with the same key raced past both checks above (possible
    // only if they asked for different days, so took different locks). The
    // unique constraint let exactly one insert win; answer the loser from it.
    if (isUniqueViolation(error, "bookings_idempotency_key_unique")) {
      const winner = await findReplay(getPool(), key.data, fingerprint);
      if (winner) return winner;
    }
    throw error;
  }
}

async function findReplay(db: Queryable, key: string, fingerprint: string): Promise<CreateBookingResult | null> {
  const existing = await bookings.findBookingByIdempotencyKey(db, key);
  if (!existing) return null;
  if (existing.requestFingerprint !== fingerprint) throw errors.idempotencyKeyReused();
  const booking = await bookings.getBookingConfirmation(db, existing.id);
  if (!booking) throw new Error(`Booking ${existing.id} has no job`);
  return { booking, replayed: true };
}

export async function listBookings(actor: AuthUser | null, query: unknown): Promise<Page<BookingListItem>> {
  requirePermission(actor, "bookings:read");
  const parsed = listBookingsQuerySchema.safeParse(query);
  if (!parsed.success) throw errors.validation(fieldErrors(parsed.error));
  const filter: ListBookingsQuery = parsed.data;

  const result = await bookings.listBookings(getPool(), {
    status: filter.status,
    search: filter.q,
    limit: PAGE_SIZE,
    offset: (filter.page - 1) * PAGE_SIZE,
  });
  return {
    items: result.items.map(({ createdAt: _createdAt, ...item }) => item),
    page: filter.page,
    pageSize: PAGE_SIZE,
    total: result.total,
  };
}

export async function getBooking(actor: AuthUser | null, bookingId: string): Promise<BookingDetail> {
  requirePermission(actor, "bookings:read");
  const id = parseId(bookingId, "Booking");
  const pool = getPool();
  const detail = await bookings.getBookingDetail(pool, id);
  if (!detail) throw errors.notFound("Booking");
  const history = await jobs.listStatusEvents(pool, detail.job.id);
  return { ...detail, history };
}
