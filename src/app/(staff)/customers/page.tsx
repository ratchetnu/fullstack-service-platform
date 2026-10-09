import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { Button, Card, EmptyState, inputClass, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/server/auth/current-user";
import { listCustomers } from "@/server/services/customer-service";
import { formatDate } from "@/shared/format";
import { firstValue } from "../page-helpers";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  const params = await searchParams;
  const q = firstValue(params.q)?.trim() || undefined;
  const page = Math.max(1, Number(firstValue(params.page)) || 1);
  const result = await listCustomers(user, { q, page });

  return (
    <>
      <PageHeader title="Customers" description="Everyone who has made a booking." />
      <Card>
        <form className="mb-4 flex gap-2" action="/customers">
          <label htmlFor="q" className="sr-only">Search customers</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name or email" className={`${inputClass} sm:w-72`} />
          <Button type="submit" variant="secondary">Search</Button>
        </form>

        {result.items.length === 0 ? (
          <EmptyState>No customers found.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Name</th>
                  <th scope="col" className="hidden py-2 pr-4 font-medium sm:table-cell">Email</th>
                  <th scope="col" className="hidden py-2 pr-4 font-medium md:table-cell">Phone</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Bookings</th>
                  <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">Latest visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4">
                      <Link href={`/customers/${customer.id}`} className="font-medium text-brand-700 hover:underline">
                        {customer.fullName}
                      </Link>
                      <span className="block text-xs text-slate-500 sm:hidden">{customer.email}</span>
                    </td>
                    <td className="hidden py-2.5 pr-4 text-slate-700 sm:table-cell">{customer.email}</td>
                    <td className="hidden py-2.5 pr-4 text-slate-700 md:table-cell">{customer.phone ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{customer.bookingCount}</td>
                    <td className="hidden py-2.5 text-right text-slate-700 sm:table-cell">
                      {customer.lastScheduledStart ? formatDate(customer.lastScheduledStart) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} basePath="/customers" query={{ q }} />
      </Card>
    </>
  );
}
