import type { Metadata } from "next";
import Link from "next/link";
import { listBookableServices } from "@/server/services/catalog-service";
import { bookableDateRange } from "@/shared/scheduling";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Request a booking" };
export const dynamic = "force-dynamic";

export default async function BookPage() {
  const services = await listBookableServices();
  const range = bookableDateRange(new Date());

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-semibold text-slate-900">
            Service Platform
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Request a booking</h1>
        <p className="mt-1 text-sm text-slate-600">All times are local to our service area (US Eastern).</p>
        <div className="mt-8">
          <BookingForm services={services} minDate={range.min} maxDate={range.max} />
        </div>
      </main>
    </div>
  );
}
