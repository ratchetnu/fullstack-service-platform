/** Shapes returned by the API and rendered by the UI. Dates are ISO 8601 strings. */
import type { JobStatus } from "./job-status";

export type Role = "admin" | "staff";

export interface ServiceOption {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
}

export interface BookingConfirmation {
  bookingId: string;
  reference: string;
  serviceName: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: JobStatus;
}

export interface BookingListItem {
  bookingId: string;
  reference: string;
  customerId: string;
  customerName: string;
  serviceName: string;
  scheduledStart: string;
  status: JobStatus;
  quotedPriceCents: number;
}

export interface StatusEvent {
  id: string;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface BookingDetail {
  bookingId: string;
  reference: string;
  createdAt: string;
  contactName: string;
  contactPhone: string | null;
  serviceAddress: string;
  notes: string | null;
  quotedPriceCents: number;
  customer: { id: string; fullName: string; email: string; phone: string | null };
  service: { id: string; name: string; durationMinutes: number };
  job: {
    id: string;
    status: JobStatus;
    version: number;
    scheduledStart: string;
    scheduledEnd: string;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
  };
  history: StatusEvent[];
}

export interface CustomerListItem {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  bookingCount: number;
  lastScheduledStart: string | null;
}

export interface CustomerDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  stats: { bookings: number; completed: number; cancelled: number; completedValueCents: number };
  bookings: BookingListItem[];
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DashboardSummary {
  today: { date: string; total: number; byStatus: Record<JobStatus, number> };
  upcomingNext7Days: number;
  last30Days: { completed: number; cancelled: number; completedValueCents: number };
  todaysJobs: BookingListItem[];
  recentBookings: (BookingListItem & { createdAt: string })[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
}
