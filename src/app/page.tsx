import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { BUSINESS } from "@/shared/business-rules";

const STEPS = [
  { title: "Request a visit", body: "Choose a service and a time. No account needed." },
  { title: "We check the schedule", body: "The request is validated and checked against crew availability." },
  { title: "A job is scheduled", body: "Staff track the job from scheduled to in progress to completed." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="font-semibold text-slate-900">Service Platform</span>
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Staff sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand-700">Reference application</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            Book a service visit in under a minute.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Open Monday to Saturday, {BUSINESS.openHour}:00 to {BUSINESS.closeHour}:00. Pick a time that suits you and
            we will take it from there.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/book" className="px-5 py-2.5">
              Request a booking
            </ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary" className="px-5 py-2.5">
              Staff dashboard
            </ButtonLink>
          </div>
        </div>

        <ol className="mt-16 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <span className="text-xs font-semibold text-brand-700">Step {index + 1}</span>
              <h2 className="mt-1 font-medium text-slate-900">{step.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        Demonstration project with synthetic data.
      </footer>
    </div>
  );
}
