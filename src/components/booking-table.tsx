import Link from "next/link";
import { formatDateTime, formatMoney } from "@/shared/format";
import type { BookingListItem } from "@/shared/types";
import { StatusBadge } from "./status-badge";
import { EmptyState } from "./ui";

/** Table on wide screens, stacked cards on phones. */
export function BookingTable({ items, showCustomer = true, empty = "No bookings found." }: {
  items: BookingListItem[];
  showCustomer?: boolean;
  empty?: string;
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;

  return (
    <>
      <ul className="divide-y divide-slate-200 sm:hidden">
        {items.map((item) => (
          <li key={item.bookingId} className="py-3">
            <Link href={`/bookings/${item.bookingId}`} className="block">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{showCustomer ? item.customerName : item.serviceName}</span>
                <StatusBadge status={item.status} />
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {formatDateTime(item.scheduledStart)} · {showCustomer ? item.serviceName : item.reference}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">Reference</th>
              {showCustomer && <th scope="col" className="py-2 pr-4 font-medium">Customer</th>}
              <th scope="col" className="py-2 pr-4 font-medium">Service</th>
              <th scope="col" className="py-2 pr-4 font-medium">Scheduled</th>
              <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2 text-right font-medium">Quote</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.bookingId} className="hover:bg-slate-50">
                <td className="py-2.5 pr-4 font-mono text-xs">
                  <Link href={`/bookings/${item.bookingId}`} className="text-brand-700 hover:underline">
                    {item.reference}
                  </Link>
                </td>
                {showCustomer && (
                  <td className="py-2.5 pr-4">
                    <Link href={`/customers/${item.customerId}`} className="hover:underline">
                      {item.customerName}
                    </Link>
                  </td>
                )}
                <td className="py-2.5 pr-4 text-slate-700">{item.serviceName}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-slate-700">{formatDateTime(item.scheduledStart)}</td>
                <td className="py-2.5 pr-4"><StatusBadge status={item.status} /></td>
                <td className="py-2.5 text-right tabular-nums text-slate-700">{formatMoney(item.quotedPriceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
