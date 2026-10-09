import { describe, expect, it } from "vitest";
import { bookableDateRange, checkSchedule, startTimesFor } from "@/shared/scheduling";

// Monday 2026-06-01, 09:00 in New York.
const NOW = new Date("2026-06-01T13:00:00Z");

describe("startTimesFor", () => {
  it("offers hourly slots that finish by closing time", () => {
    expect(startTimesFor(60)).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
    expect(startTimesFor(240)).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"]);
  });
});

describe("checkSchedule", () => {
  const base = { date: "2026-06-03", startTime: "10:00", durationMinutes: 120, now: NOW };

  it("accepts a valid request and computes the window", () => {
    const result = checkSchedule(base);
    expect(result).toEqual({
      ok: true,
      start: new Date("2026-06-03T14:00:00.000Z"),
      end: new Date("2026-06-03T16:00:00.000Z"),
    });
  });

  it("rejects Sundays", () => {
    expect(checkSchedule({ ...base, date: "2026-06-07" })).toMatchObject({ ok: false, code: "CLOSED_DAY" });
  });

  it("rejects a start time before opening", () => {
    expect(checkSchedule({ ...base, startTime: "07:00" })).toMatchObject({ ok: false, code: "OUTSIDE_BUSINESS_HOURS" });
  });

  it("rejects a job that would run past closing", () => {
    expect(checkSchedule({ ...base, startTime: "17:00" })).toMatchObject({ ok: false, code: "OUTSIDE_BUSINESS_HOURS" });
  });

  it("rejects times that are not on a slot boundary", () => {
    expect(checkSchedule({ ...base, startTime: "10:30" })).toMatchObject({ ok: false, code: "OUTSIDE_BUSINESS_HOURS" });
  });

  it("requires two hours' notice", () => {
    expect(checkSchedule({ ...base, date: "2026-06-01", startTime: "10:00" })).toMatchObject({ ok: false, code: "TOO_SOON" });
    expect(checkSchedule({ ...base, date: "2026-06-01", startTime: "11:00" })).toMatchObject({ ok: true });
  });

  it("rejects dates in the past", () => {
    expect(checkSchedule({ ...base, date: "2026-05-30" })).toMatchObject({ ok: false, code: "TOO_SOON" });
  });

  it("rejects dates more than 60 days ahead", () => {
    expect(checkSchedule({ ...base, date: "2026-07-31" })).toMatchObject({ ok: true });
    expect(checkSchedule({ ...base, date: "2026-08-01" })).toMatchObject({ ok: false, code: "TOO_FAR_AHEAD" });
  });
});

describe("bookableDateRange", () => {
  it("runs from today to 60 days ahead in business time", () => {
    expect(bookableDateRange(NOW)).toEqual({ min: "2026-06-01", max: "2026-07-31" });
  });
});
