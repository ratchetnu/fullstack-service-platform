import type { Metadata } from "next";
import Link from "next/link";
import { BookingTable } from "@/components/booking-table";
import { StatusBadge } from "@/components/status-badge";
import { Card, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/server/auth/current-user";
import { getDashboard } from "@/server/services/dashboard-service";
import { formatDateTime, formatLocalDate, formatMoney } from "@/shared/format";
import { JOB_STATUSES } from "@/shared/job-status";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requirePageUser();
  const summary = await getDashboard(user);
  const { completed, cancelled, completedValueCents } = summary.last30Days;
  const finished = completed + cancelled;
  const cancellationRate = finished === 0 ? "—" : `${Math.round((cancelled / finished) * 100)}%`;

  return (
    <>
      <PageHeader title="Dashboard" description={formatLocalDate(summary.today.date)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Jobs today" value={summary.today.total} detail={`${summary.today.byStatus.in_progress} in progress`} />
        <Stat label="Next 7 days" value={summary.upcomingNext7Days} detail="scheduled jobs" />
        <Stat label="Completed · 30 days" value={completed} detail={`${formatMoney(completedValueCents)} of work`} />
        <Stat label="Cancellation rate" value={cancellationRate} detail={`${cancelled} of ${finished} finished jobs`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Today's schedule"
          actions={
            <div className="hidden gap-1.5 sm:flex">
              {JOB_STATUSES.filter((status) => summary.today.byStatus[status] > 0).map((status) => (
                <span key={status} className="flex items-center gap-1 text-xs text-slate-500">
                  <StatusBadge status={status} /> {summary.today.byStatus[status]}
                </span>
              ))}
            </div>
          }
        >
          <BookingTable items={summary.todaysJobs} empty="Nothing scheduled today." />
        </Card>

        <Card title="Latest bookings" actions={<Link href="/bookings" className="text-sm text-brand-700 hover:underline">View all</Link>}>
          <ul className="divide-y divide-slate-100">
            {summary.recentBookings.map((booking) => (
              <li key={booking.bookingId} className="py-2.5">
                <Link href={`/bookings/${booking.bookingId}`} className="block hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{booking.customerName}</span>
                    <StatusBadge status={booking.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {booking.serviceName} · {formatDateTime(booking.scheduledStart)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
