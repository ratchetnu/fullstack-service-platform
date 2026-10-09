import { describe, expect, it } from "vitest";
import type { AuthUser } from "@/server/auth/policy";
import { createBooking, getBooking } from "@/server/services/booking-service";
import { transitionJob } from "@/server/services/job-service";
import { bookingRequest, countRows, newKey, useDatabase } from "./helpers";

describe("transitionJob", () => {
  const fixtures = useDatabase();
  const staff = (): AuthUser => ({ id: fixtures().users.staff, email: "staff@example.test", displayName: "Test staff", role: "staff" });
  const admin = (): AuthUser => ({ id: fixtures().users.admin, email: "admin@example.test", displayName: "Test admin", role: "admin" });

  async function newJob(overrides: Record<string, unknown> = {}) {
    const { booking } = await createBooking(bookingRequest(fixtures().services.standard, overrides), newKey());
    const detail = await getBooking(staff(), booking.bookingId);
    return { bookingId: booking.bookingId, jobId: detail.job.id };
  }

  it("moves a job through its lifecycle, recording who did what", async () => {
    const { bookingId, jobId } = await newJob();

    const started = await transitionJob(staff(), jobId, { to: "in_progress", expectedVersion: 1 });
    expect(started).toMatchObject({ changed: true, job: { status: "in_progress", version: 2, startedAt: expect.any(String) } });

    const completed = await transitionJob(staff(), jobId, { to: "completed", expectedVersion: 2 });
    expect(completed.job).toMatchObject({ status: "completed", version: 3, completedAt: expect.any(String) });

    const detail = await getBooking(staff(), bookingId);
    expect(detail.history.map((e) => [e.fromStatus, e.toStatus, e.actorName])).toEqual([
      [null, "scheduled", null],
      ["scheduled", "in_progress", "Test staff"],
      ["in_progress", "completed", "Test staff"],
    ]);
  });

  it("is a harmless no-op when the same change is requested twice", async () => {
    const { jobId } = await newJob();
    await transitionJob(staff(), jobId, { to: "in_progress", expectedVersion: 1 });

    // A retry of the same request still carries the old version.
    const retry = await transitionJob(staff(), jobId, { to: "in_progress", expectedVersion: 1 });
    expect(retry).toMatchObject({ changed: false, job: { status: "in_progress", version: 2 } });
    expect(await countRows("job_status_events")).toBe(2);
  });

  it("rejects a change based on an out-of-date version", async () => {
    const { jobId } = await newJob();
    await transitionJob(staff(), jobId, { to: "in_progress", expectedVersion: 1 });
    await expect(transitionJob(admin(), jobId, { to: "cancelled", expectedVersion: 1, reason: "Customer called" })).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });
  });

  it("lets exactly one of two simultaneous conflicting changes win", async () => {
    const { jobId } = await newJob();
    const outcomes = await Promise.allSettled([
      transitionJob(staff(), jobId, { to: "in_progress", expectedVersion: 1 }),
      transitionJob(admin(), jobId, { to: "cancelled", expectedVersion: 1, reason: "Duplicate request" }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((o) => o.status === "rejected")?.reason).toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("rejects transitions the lifecycle does not allow", async () => {
    const { jobId } = await newJob();
    await expect(transitionJob(staff(), jobId, { to: "completed", expectedVersion: 1 })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("allows only admins to cancel, and requires a reason", async () => {
    const { jobId } = await newJob();
    await expect(transitionJob(staff(), jobId, { to: "cancelled", expectedVersion: 1, reason: "Not needed" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(transitionJob(admin(), jobId, { to: "cancelled", expectedVersion: 1 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const cancelled = await transitionJob(admin(), jobId, { to: "cancelled", expectedVersion: 1, reason: "Not needed" });
    expect(cancelled.job).toMatchObject({ status: "cancelled", cancellationReason: "Not needed" });
  });

  it("frees the crew when a job is cancelled", async () => {
    const jobs = [];
    for (let i = 0; i < 3; i++) jobs.push(await newJob({ customer: { fullName: `Customer ${i}`, email: `c${i}@example.test` } }));
    const request = bookingRequest(fixtures().services.standard, { customer: { fullName: "Waiting", email: "w@example.test" } });
    await expect(createBooking(request, newKey())).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    await transitionJob(admin(), jobs[0]!.jobId, { to: "cancelled", expectedVersion: 1, reason: "Customer rescheduled" });
    await expect(createBooking(request, newKey())).resolves.toMatchObject({ replayed: false });
  });

  it("requires a signed-in user and an existing job", async () => {
    const { jobId } = await newJob();
    await expect(transitionJob(null, jobId, { to: "in_progress", expectedVersion: 1 })).rejects.toMatchObject({ status: 401 });
    await expect(transitionJob(staff(), "not-a-uuid", { to: "in_progress", expectedVersion: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(
      transitionJob(staff(), "3f0c8b9e-0000-4000-8000-000000000000", { to: "in_progress", expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
