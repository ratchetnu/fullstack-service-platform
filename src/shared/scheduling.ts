import { BUSINESS } from "./business-rules";
import { addDays, getZonedParts, toLocalDate, zonedTimeToUtc } from "./time";

export type ScheduleViolationCode =
  | "CLOSED_DAY"
  | "OUTSIDE_BUSINESS_HOURS"
  | "TOO_SOON"
  | "TOO_FAR_AHEAD";

export type ScheduleCheck =
  | { ok: true; start: Date; end: Date }
  | { ok: false; code: ScheduleViolationCode; message: string };

/** Start times a customer may choose for a service of the given length. */
export function startTimesFor(durationMinutes: number): string[] {
  const times: string[] = [];
  const close = BUSINESS.closeHour * 60;
  for (let minutes = BUSINESS.openHour * 60; minutes + durationMinutes <= close; minutes += BUSINESS.slotIntervalMinutes) {
    times.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return times;
}

/** First and last dates the booking form should offer, relative to `now`. */
export function bookableDateRange(now: Date): { min: string; max: string } {
  const today = toLocalDate(now, BUSINESS.timeZone);
  return { min: today, max: addDays(today, BUSINESS.maxAdvanceDays) };
}

/**
 * Applies the business rules to a requested local date and time.
 * Expects `date` and `startTime` to be well-formed (validated by the request schema).
 */
export function checkSchedule(input: {
  date: string;
  startTime: string;
  durationMinutes: number;
  now: Date;
}): ScheduleCheck {
  const { date, startTime, durationMinutes, now } = input;
  const start = zonedTimeToUtc(date, startTime, BUSINESS.timeZone);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const local = getZonedParts(start, BUSINESS.timeZone);

  if (!BUSINESS.openWeekdays.includes(local.weekday)) {
    return { ok: false, code: "CLOSED_DAY", message: "We are closed on that day. Please choose Monday to Saturday." };
  }

  // Also catches times that do not exist locally because of a daylight-saving change.
  const requestedLocalTime = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  if (requestedLocalTime !== startTime || !startTimesFor(durationMinutes).includes(startTime)) {
    return {
      ok: false,
      code: "OUTSIDE_BUSINESS_HOURS",
      message: `Please choose a start time between ${BUSINESS.openHour}:00 and ${BUSINESS.closeHour}:00 that leaves time to finish the job.`,
    };
  }

  if (start.getTime() < now.getTime() + BUSINESS.minLeadTimeMinutes * 60_000) {
    return {
      ok: false,
      code: "TOO_SOON",
      message: `Bookings need at least ${BUSINESS.minLeadTimeMinutes / 60} hours' notice.`,
    };
  }

  if (date > bookableDateRange(now).max) {
    return {
      ok: false,
      code: "TOO_FAR_AHEAD",
      message: `Bookings can be made up to ${BUSINESS.maxAdvanceDays} days ahead.`,
    };
  }

  return { ok: true, start, end };
}
