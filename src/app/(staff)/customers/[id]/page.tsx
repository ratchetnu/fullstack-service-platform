import type { Metadata } from "next";
import Link from "next/link";
import { BookingTable } from "@/components/booking-table";
import { Card, DescriptionList, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/server/auth/current-user";
import { getCustomer } from "@/server/services/customer-service";
import { formatDate, formatMoney } from "@/shared/format";
import { orNotFound } from "../../page-helpers";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser();
  const customer = await orNotFound(getCustomer(user, id));

  return (
    <>
      <nav className="mb-4 text-sm">
        <Link href="/customers" className="text-slate-500 hover:text-slate-900">← Customers</Link>
      </nav>
      <PageHeader title={customer.fullName} description={`Customer since ${formatDate(customer.createdAt)}`} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Contact">
          <DescriptionList
            columns={1}
            items={[
              { label: "Email", value: customer.email },
              { label: "Phone", value: customer.phone ?? "—" },
            ]}
          />
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 text-sm">
            <div><dt className="text-slate-500">Bookings</dt><dd className="text-lg font-semibold tabular-nums">{customer.stats.bookings}</dd></div>
            <div><dt className="text-slate-500">Completed</dt><dd className="text-lg font-semibold tabular-nums">{customer.stats.completed}</dd></div>
            <div><dt className="text-slate-500">Cancelled</dt><dd className="text-lg font-semibold tabular-nums">{customer.stats.cancelled}</dd></div>
            <div><dt className="text-slate-500">Completed value</dt><dd className="text-lg font-semibold tabular-nums">{formatMoney(customer.stats.completedValueCents)}</dd></div>
          </dl>
        </Card>
        <Card title="Bookings" className="lg:col-span-2">
          <BookingTable items={customer.bookings} showCustomer={false} empty="This customer has no bookings yet." />
        </Card>
      </div>
    </>
  );
}
