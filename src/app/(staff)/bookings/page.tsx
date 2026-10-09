import type { Metadata } from "next";
import Link from "next/link";
import { BookingTable } from "@/components/booking-table";
import { Pagination } from "@/components/pagination";
import { Button, Card, inputClass, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/server/auth/current-user";
import { listBookings } from "@/server/services/booking-service";
import { JOB_STATUS_LABELS, JOB_STATUSES, isJobStatus } from "@/shared/job-status";
import { firstValue } from "../page-helpers";

export const metadata: Metadata = { title: "Bookings" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser();
  const params = await searchParams;
  const rawStatus = firstValue(params.status);
  const status = isJobStatus(rawStatus) ? rawStatus : undefined;
  const q = firstValue(params.q)?.trim() || undefined;
  const page = Math.max(1, Number(firstValue(params.page)) || 1);

  const result = await listBookings(user, { status, q, page });

  const tabHref = (value?: string) => {
    const search = new URLSearchParams();
    if (value) search.set("status", value);
    if (q) search.set("q", q);
    const query = search.toString();
    return query ? `/bookings?${query}` : "/bookings";
  };
  const tabs = [{ value: undefined, label: "All" }, ...JOB_STATUSES.map((s) => ({ value: s, label: JOB_STATUS_LABELS[s] }))];

  return (
    <>
      <PageHeader title="Bookings" description="Every booking and the status of its job." />
      <Card>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <Link
                key={tab.label}
                href={tabHref(tab.value)}
                aria-current={status === tab.value ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                  status === tab.value ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <form className="flex gap-2" action="/bookings">
            {status && <input type="hidden" name="status" value={status} />}
            <label htmlFor="q" className="sr-only">Search bookings</label>
            <input id="q" name="q" defaultValue={q} placeholder="Reference, name or email" className={`${inputClass} lg:w-64`} />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </div>
        <BookingTable items={result.items} />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} basePath="/bookings" query={{ status, q }} />
      </Card>
    </>
  );
}
