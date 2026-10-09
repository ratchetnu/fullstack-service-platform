import { describe, expect, it } from "vitest";
import { addDays, getZonedParts, isValidLocalDate, localDayBounds, toLocalDate, zonedTimeToUtc } from "@/shared/time";

const NY = "America/New_York";

describe("zonedTimeToUtc", () => {
  it("converts winter (EST, UTC-5) wall time", () => {
    expect(zonedTimeToUtc("2026-01-15", "10:00", NY).toISOString()).toBe("2026-01-15T15:00:00.000Z");
  });

  it("converts summer (EDT, UTC-4) wall time", () => {
    expect(zonedTimeToUtc("2026-07-15", "10:00", NY).toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });

  it("handles the day clocks go forward", () => {
    // 2026-03-08: 02:00 EST jumps to 03:00 EDT.
    expect(zonedTimeToUtc("2026-03-08", "08:00", NY).toISOString()).toBe("2026-03-08T12:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-08", "01:00", NY).toISOString()).toBe("2026-03-08T06:00:00.000Z");
  });

  it("handles the day clocks go back", () => {
    // 2026-11-01: 02:00 EDT falls back to 01:00 EST.
    expect(zonedTimeToUtc("2026-11-01", "08:00", NY).toISOString()).toBe("2026-11-01T13:00:00.000Z");
  });

  it("round-trips through getZonedParts", () => {
    const instant = zonedTimeToUtc("2026-05-04", "16:30", NY);
    expect(getZonedParts(instant, NY)).toMatchObject({ year: 2026, month: 5, day: 4, hour: 16, minute: 30, weekday: 1 });
  });

  it("rejects malformed input", () => {
    expect(() => zonedTimeToUtc("2026-02-30", "10:00", NY)).toThrow(RangeError);
    expect(() => zonedTimeToUtc("2026-01-01", "25:00", NY)).toThrow(RangeError);
  });
});

describe("calendar helpers", () => {
  it("validates real calendar dates", () => {
    expect(isValidLocalDate("2028-02-29")).toBe(true);
    expect(isValidLocalDate("2026-02-29")).toBe(false);
    expect(isValidLocalDate("2026-13-01")).toBe(false);
    expect(isValidLocalDate("26-01-01")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("gives the local date of an instant", () => {
    // 03:00 UTC is still the previous evening in New York.
    expect(toLocalDate(new Date("2026-06-10T03:00:00Z"), NY)).toBe("2026-06-09");
  });

  it("computes a 23-hour day when clocks go forward", () => {
    const { start, end } = localDayBounds("2026-03-08", NY);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
});
