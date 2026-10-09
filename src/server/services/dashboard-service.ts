import "server-only";
import { BUSINESS } from "@/shared/business-rules";
import { localDayBounds, toLocalDate } from "@/shared/time";
import type { DashboardSummary } from "@/shared/types";
import { type AuthUser, requirePermission } from "../auth/policy";
import { getPool } from "../db/pool";
import * as bookings from "../repositories/bookings";
import * as jobs from "../repositories/jobs";

const DAY_MS = 86_400_000;

export async function getDashboard(actor: AuthUser | null, now: Date = new Date()): Promise<DashboardSummary> {
  requirePermission(actor, "dashboard:read");
  const pool = getPool();
  const today = toLocalDate(now, BUSINESS.timeZone);
  const { start, end } = localDayBounds(today, BUSINESS.timeZone);

  const [byStatus, upcoming, outcomes, todaysJobs, recent] = await Promise.all([
    jobs.jobCountsByStatus(pool, start, end),
    jobs.countScheduledBetween(pool, now, new Date(now.getTime() + 7 * DAY_MS)),
    jobs.outcomesSince(pool, new Date(now.getTime() - 30 * DAY_MS)),
    bookings.listBookings(pool, { scheduledFrom: start, scheduledBefore: end, order: "schedule_asc", limit: 50 }),
    bookings.listBookings(pool, { order: "created_desc", limit: 6 }),
  ]);

  return {
    today: {
      date: today,
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      byStatus,
    },
    upcomingNext7Days: upcoming,
    last30Days: outcomes,
    todaysJobs: todaysJobs.items.map(({ createdAt: _createdAt, ...item }) => item),
    recentBookings: recent.items,
  };
}
