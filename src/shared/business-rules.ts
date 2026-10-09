/**
 * Business rules for when work can be booked. They live in one place so the
 * booking form and the API apply exactly the same rules.
 */

export const BUSINESS = {
  /** All dates and times customers pick are in the business's local time. */
  timeZone: "America/New_York",
  /** Opening hours, local time. A job must start and finish inside them. */
  openHour: 8,
  closeHour: 18,
  /** 0 = Sunday … 6 = Saturday. The business is closed on Sundays. */
  openWeekdays: [1, 2, 3, 4, 5, 6] as readonly number[],
  /** Start times are offered every 60 minutes. */
  slotIntervalMinutes: 60,
  /** Number of crews, i.e. how many jobs can run at the same time. */
  crewCapacity: 3,
  /** Bookings must be made at least this far ahead. */
  minLeadTimeMinutes: 120,
  /** And no further ahead than this. */
  maxAdvanceDays: 60,
} as const;
