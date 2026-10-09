import type { JobStatus } from "@/shared/job-status";
import type { StatusEvent } from "@/shared/types";
import type { Queryable } from "../db/pool";
import { iso } from "./sql";

export interface JobRecord {
  id: string;
  bookingId: string;
  status: JobStatus;
  version: number;
  scheduledStart: string;
  scheduledEnd: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

interface JobRow {
  id: string;
  booking_id: string;
  status: JobStatus;
  version: number;
  scheduled_start: Date;
  scheduled_end: Date;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
}

const JOB_COLUMNS = `id, booking_id, status, version, scheduled_start, scheduled_end,
                     started_at, completed_at, cancelled_at, cancellation_reason`;

function toJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    bookingId: row.booking_id,
    status: row.status,
    version: row.version,
    scheduledStart: iso(row.scheduled_start),
    scheduledEnd: iso(row.scheduled_end),
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    cancelledAt: iso(row.cancelled_at),
    cancellationReason: row.cancellation_reason,
  };
}

// Namespace for advisory locks that guard the schedule, so they cannot clash
// with locks taken for any other purpose.
const SCHEDULE_LOCK_NAMESPACE = 1001;

/**
 * Makes concurrent bookings for the same local day wait for each other until
 * the current transaction ends. Without it, two requests could both see
 * "2 of 3 crews busy" and both book the last crew.
 */
export async function lockScheduleDay(db: Queryable, localDate: string): Promise<void> {
  const dayNumber = Math.floor(Date.parse(`${localDate}T00:00:00Z`) / 86_400_000);
  await db.query(`SELECT pg_advisory_xact_lock($1, $2)`, [SCHEDULE_LOCK_NAMESPACE, dayNumber]);
}

/** Active jobs (scheduled or in progress) whose time window overlaps [start, end). */
export async function countActiveJobsOverlapping(db: Queryable, start: Date, end: Date): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM jobs
      WHERE status IN ('scheduled', 'in_progress')
        AND scheduled_start < $2
        AND scheduled_end > $1`,
    [start, end],
  );
  return rows[0]?.count ?? 0;
}

export async function insertJob(
  db: Queryable,
  job: { bookingId: string; scheduledStart: Date; scheduledEnd: Date },
): Promise<JobRecord> {
  const { rows } = await db.query<JobRow>(
    `INSERT INTO jobs (booking_id, scheduled_start, scheduled_end)
     VALUES ($1, $2, $3)
     RETURNING ${JOB_COLUMNS}`,
    [job.bookingId, job.scheduledStart, job.scheduledEnd],
  );
  return toJob(rows[0]!);
}

/** Reads a job and locks its row until the transaction ends. */
export async function findJobForUpdate(db: Queryable, jobId: string): Promise<JobRecord | null> {
  const { rows } = await db.query<JobRow>(`SELECT ${JOB_COLUMNS} FROM jobs WHERE id = $1 FOR UPDATE`, [jobId]);
  return rows[0] ? toJob(rows[0]) : null;
}

export async function updateJobStatus(
  db: Queryable,
  jobId: string,
  to: JobStatus,
  cancellationReason: string | null,
): Promise<JobRecord> {
  const { rows } = await db.query<JobRow>(
    `UPDATE jobs
        SET status = $2::job_status,
            started_at = CASE WHEN $2::job_status = 'in_progress' THEN now() ELSE started_at END,
            completed_at = CASE WHEN $2::job_status = 'completed' THEN now() ELSE completed_at END,
            cancelled_at = CASE WHEN $2::job_status = 'cancelled' THEN now() ELSE cancelled_at END,
            cancellation_reason = CASE WHEN $2::job_status = 'cancelled' THEN $3::text ELSE cancellation_reason END,
            version = version + 1,
            updated_at = now()
      WHERE id = $1
      RETURNING ${JOB_COLUMNS}`,
    [jobId, to, cancellationReason],
  );
  return toJob(rows[0]!);
}

export async function insertStatusEvent(
  db: Queryable,
  event: { jobId: string; fromStatus: JobStatus | null; toStatus: JobStatus; actorUserId: string | null; note: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO job_status_events (job_id, from_status, to_status, actor_user_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [event.jobId, event.fromStatus, event.toStatus, event.actorUserId, event.note],
  );
}

export async function listStatusEvents(db: Queryable, jobId: string): Promise<StatusEvent[]> {
  const { rows } = await db.query<{
    id: string;
    from_status: JobStatus | null;
    to_status: JobStatus;
    note: string | null;
    actor_name: string | null;
    created_at: Date;
  }>(
    `SELECT e.id::text, e.from_status, e.to_status, e.note, u.display_name AS actor_name, e.created_at
       FROM job_status_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.job_id = $1
      ORDER BY e.created_at, e.id`,
    [jobId],
  );
  return rows.map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    actorName: row.actor_name,
    createdAt: iso(row.created_at),
  }));
}

export async function jobCountsByStatus(
  db: Queryable,
  from: Date,
  before: Date,
): Promise<Record<JobStatus, number>> {
  const { rows } = await db.query<{ status: JobStatus; count: number }>(
    `SELECT status, count(*)::int AS count
       FROM jobs
      WHERE scheduled_start >= $1 AND scheduled_start < $2
      GROUP BY status`,
    [from, before],
  );
  const counts: Record<JobStatus, number> = { scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 };
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

export async function countScheduledBetween(db: Queryable, from: Date, before: Date): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM jobs
      WHERE status = 'scheduled' AND scheduled_start >= $1 AND scheduled_start < $2`,
    [from, before],
  );
  return rows[0]?.count ?? 0;
}

export async function outcomesSince(
  db: Queryable,
  since: Date,
): Promise<{ completed: number; cancelled: number; completedValueCents: number }> {
  const { rows } = await db.query<{ completed: number; cancelled: number; completed_value_cents: number }>(
    `SELECT count(*) FILTER (WHERE j.status = 'completed' AND j.completed_at >= $1)::int AS completed,
            count(*) FILTER (WHERE j.status = 'cancelled' AND j.cancelled_at >= $1)::int AS cancelled,
            coalesce(sum(b.quoted_price_cents) FILTER (WHERE j.status = 'completed' AND j.completed_at >= $1), 0)::int
              AS completed_value_cents
       FROM jobs j
       JOIN bookings b ON b.id = j.booking_id
      WHERE j.status IN ('completed', 'cancelled')`,
    [since],
  );
  const row = rows[0];
  return {
    completed: row?.completed ?? 0,
    cancelled: row?.cancelled ?? 0,
    completedValueCents: row?.completed_value_cents ?? 0,
  };
}
