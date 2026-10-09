import "server-only";
import { canTransition } from "@/shared/job-status";
import { fieldErrors, jobTransitionSchema } from "@/shared/schemas";
import { type AuthUser, requirePermission } from "../auth/policy";
import { withTransaction } from "../db/transaction";
import { errors } from "../errors";
import { logger } from "../logger";
import * as jobs from "../repositories/jobs";
import { parseId } from "./ids";

export interface TransitionResult {
  job: jobs.JobRecord;
  /** False when the job was already in the requested status (a repeated request). */
  changed: boolean;
}

/**
 * Moves a job to a new status.
 *
 * - Concurrency: the job row is locked for the duration of the change, and the
 *   caller must send the version it last saw. If someone else changed the job
 *   in the meantime, the request is rejected instead of silently overwriting.
 * - Retry-safe: asking for the status the job already has succeeds without
 *   making a second change, so a repeated click or network retry is harmless.
 */
export async function transitionJob(
  actor: AuthUser | null,
  jobId: string,
  body: unknown,
): Promise<TransitionResult> {
  requirePermission(actor, "jobs:progress");
  const id = parseId(jobId, "Job");
  const parsed = jobTransitionSchema.safeParse(body);
  if (!parsed.success) throw errors.validation(fieldErrors(parsed.error));
  const { to, expectedVersion, reason } = parsed.data;
  if (to === "cancelled") requirePermission(actor, "jobs:cancel");

  return withTransaction(async (tx) => {
    const job = await jobs.findJobForUpdate(tx, id);
    if (!job) throw errors.notFound("Job");

    if (job.status === to) return { job, changed: false };
    if (job.version !== expectedVersion) throw errors.versionConflict();
    if (!canTransition(job.status, to)) throw errors.invalidTransition(job.status, to);

    const updated = await jobs.updateJobStatus(tx, id, to, to === "cancelled" ? (reason ?? null) : null);
    await jobs.insertStatusEvent(tx, {
      jobId: id,
      fromStatus: job.status,
      toStatus: to,
      actorUserId: actor.id,
      note: reason ?? null,
    });

    logger.info("job status changed", { jobId: id, from: job.status, to, actorUserId: actor.id });
    return { job: updated, changed: true };
  });
}
