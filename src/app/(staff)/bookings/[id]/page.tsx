import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Card, DescriptionList, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/server/auth/current-user";
import { hasPermission } from "@/server/auth/policy";
import { getBooking } from "@/server/services/booking-service";
import { formatDateTime, formatDuration, formatMoney, formatTime } from "@/shared/format";
import { JOB_STATUS_LABELS } from "@/shared/job-status";
import { orNotFound } from "../../page-helpers";
import { JobActions } from "./job-actions";

export const metadata: Metadata = { title: "Booking" };

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser();
  const booking = await orNotFound(getBooking(user, id));
  const { job } = booking;

  return (
    <>
      <nav className="mb-4 text-sm">
        <Link href="/bookings" className="text-slate-500 hover:text-slate-900">← Bookings</Link>
      </nav>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{booking.reference}</span><StatusBadge status={job.status} /></span>}
        description={`${booking.service.name} for ${booking.customer.fullName}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Job">
            <DescriptionList
              items={[
                { label: "Scheduled", value: `${formatDateTime(job.scheduledStart)} – ${formatTime(job.scheduledEnd)}` },
                { label: "Duration", value: formatDuration(booking.service.durationMinutes) },
                { label: "Started", value: job.startedAt ? formatDateTime(job.startedAt) : "—" },
                { label: "Completed", value: job.completedAt ? formatDateTime(job.completedAt) : "—" },
                ...(job.cancelledAt
                  ? [
                      { label: "Cancelled", value: formatDateTime(job.cancelledAt) },
                      { label: "Reason", value: job.cancellationReason },
                    ]
                  : []),
                { label: "Quote", value: formatMoney(booking.quotedPriceCents) },
                { label: "Version", value: <span className="tabular-nums">{job.version}</span> },
              ]}
            />
            <div className="mt-6 border-t border-slate-200 pt-4">
              <JobActions
                jobId={job.id}
                status={job.status}
                version={job.version}
                canProgress={hasPermission(user, "jobs:progress")}
                canCancel={hasPermission(user, "jobs:cancel")}
              />
            </div>
          </Card>

          <Card title="Customer and site">
            <DescriptionList
              items={[
                { label: "Customer", value: <Link className="text-brand-700 hover:underline" href={`/customers/${booking.customer.id}`}>{booking.customer.fullName}</Link> },
                { label: "Email", value: booking.customer.email },
                { label: "Contact name on request", value: booking.contactName },
                { label: "Phone on request", value: booking.contactPhone ?? "—" },
                { label: "Service address", value: booking.serviceAddress },
                { label: "Booked", value: formatDateTime(booking.createdAt) },
              ]}
            />
            {booking.notes && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{booking.notes}</p>
              </div>
            )}
          </Card>
        </div>

        <Card title="History">
          <ol className="relative space-y-5 border-l border-slate-200 pl-5">
            {booking.history.map((event) => (
              <li key={event.id}>
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-white ring-2 ring-brand-600" aria-hidden />
                <p className="text-sm font-medium text-slate-900">
                  {event.fromStatus ? `${JOB_STATUS_LABELS[event.fromStatus]} → ${JOB_STATUS_LABELS[event.toStatus]}` : JOB_STATUS_LABELS[event.toStatus]}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(event.createdAt)} · {event.actorName ?? "Customer"}
                </p>
                {event.note && <p className="mt-1 text-sm text-slate-700">{event.note}</p>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
