import { describe, expect, it } from "vitest";
import { allowedTransitions, canTransition, isJobStatus, isTerminal, JOB_STATUSES, type JobStatus } from "@/shared/job-status";

describe("job status lifecycle", () => {
  const allowed: [JobStatus, JobStatus][] = [
    ["scheduled", "in_progress"],
    ["scheduled", "cancelled"],
    ["in_progress", "completed"],
    ["in_progress", "cancelled"],
  ];

  it.each(allowed)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it("rejects every other transition", () => {
    for (const from of JOB_STATUSES) {
      for (const to of JOB_STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it("treats completed and cancelled as final", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("scheduled")).toBe(false);
    expect(allowedTransitions("completed")).toEqual([]);
  });

  it("recognises valid status strings", () => {
    expect(isJobStatus("in_progress")).toBe(true);
    expect(isJobStatus("done")).toBe(false);
    expect(isJobStatus(undefined)).toBe(false);
  });
});
