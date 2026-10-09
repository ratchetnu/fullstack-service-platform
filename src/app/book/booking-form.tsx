"use client";

import { type FormEvent, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/components/api-client";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { formatDateTime, formatDuration, formatMoney } from "@/shared/format";
import { createBookingSchema, fieldErrors } from "@/shared/schemas";
import { startTimesFor } from "@/shared/scheduling";
import type { BookingConfirmation, ServiceOption } from "@/shared/types";

interface FormValues {
  serviceId: string;
  date: string;
  startTime: string;
  fullName: string;
  email: string;
  phone: string;
  serviceAddress: string;
  notes: string;
}

const EMPTY: FormValues = {
  serviceId: "",
  date: "",
  startTime: "",
  fullName: "",
  email: "",
  phone: "",
  serviceAddress: "",
  notes: "",
};

// Maps schema paths ("customer.email") to form fields ("email").
const FIELD_FOR_PATH: Record<string, keyof FormValues> = {
  serviceId: "serviceId",
  date: "date",
  startTime: "startTime",
  "customer.fullName": "fullName",
  "customer.email": "email",
  "customer.phone": "phone",
  serviceAddress: "serviceAddress",
  notes: "notes",
};

function toFormErrors(errors: Record<string, string>): Partial<Record<keyof FormValues, string>> {
  const result: Partial<Record<keyof FormValues, string>> = {};
  for (const [path, message] of Object.entries(errors)) {
    const field = FIELD_FOR_PATH[path];
    if (field) result[field] = message;
  }
  return result;
}

export function BookingForm({ services, minDate, maxDate }: { services: ServiceOption[]; minDate: string; maxDate: string }) {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  // One idempotency key per distinct submission. Resubmitting the same values
  // (after a timeout, say) reuses it, so the server returns the booking it
  // already made instead of creating a duplicate. Editing the form starts a
  // new submission with a new key.
  const idempotencyKey = useRef<string | null>(null);

  const service = services.find((s) => s.id === values.serviceId);
  const startTimes = service ? startTimesFor(service.durationMinutes) : [];

  function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    idempotencyKey.current = null;
    setValues((current) => {
      const next = { ...current, [field]: value };
      // A start time valid for a short service may not fit a longer one.
      if (field === "serviceId" && next.startTime) {
        const chosen = services.find((s) => s.id === value);
        if (chosen && !startTimesFor(chosen.durationMinutes).includes(next.startTime)) next.startTime = "";
      }
      return next;
    });
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = {
      serviceId: values.serviceId,
      date: values.date,
      startTime: values.startTime,
      customer: { fullName: values.fullName, email: values.email, phone: values.phone },
      serviceAddress: values.serviceAddress,
      notes: values.notes,
    };
    const parsed = createBookingSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(toFormErrors(fieldErrors(parsed.error)));
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setSubmitting(true);
    try {
      const result = await apiFetch<{ booking: BookingConfirmation }>("/api/v1/bookings", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey.current },
        body: JSON.stringify(payload),
      });
      setConfirmation(result.booking);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(toFormErrors(error.fields));
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200" data-testid="booking-confirmation">
        <h2 className="text-lg font-semibold text-slate-900">Booking confirmed</h2>
        <p className="mt-1 text-sm text-slate-600">Keep this reference in case you need to contact us.</p>
        <p className="mt-4 font-mono text-2xl font-semibold tracking-wider text-brand-700">{confirmation.reference}</p>
        <dl className="mt-4 space-y-1 text-sm text-slate-700">
          <div><dt className="inline font-medium">Service: </dt><dd className="inline">{confirmation.serviceName}</dd></div>
          <div><dt className="inline font-medium">When: </dt><dd className="inline">{formatDateTime(confirmation.scheduledStart)}</dd></div>
        </dl>
        <Button
          variant="secondary"
          className="mt-6"
          onClick={() => {
            setConfirmation(null);
            setValues(EMPTY);
            idempotencyKey.current = null;
          }}
        >
          Make another booking
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {formError && <Alert>{formError}</Alert>}

      <fieldset>
        <legend className="text-base font-semibold text-slate-900">1. Choose a service</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-invalid={Boolean(errors.serviceId)}>
          {services.map((option) => (
            <label
              key={option.id}
              className={`cursor-pointer rounded-lg bg-white p-4 ring-1 transition has-[:checked]:ring-2 has-[:checked]:ring-brand-600 ${
                errors.serviceId ? "ring-red-300" : "ring-slate-200 hover:ring-slate-300"
              }`}
            >
              <input
                type="radio"
                name="serviceId"
                value={option.id}
                checked={values.serviceId === option.id}
                onChange={() => update("serviceId", option.id)}
                className="sr-only"
              />
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">{option.name}</span>
                <span className="text-sm tabular-nums text-slate-700">{formatMoney(option.priceCents)}</span>
              </span>
              <span className="mt-1 block text-sm text-slate-600">{option.description}</span>
              <span className="mt-2 block text-xs text-slate-500">{formatDuration(option.durationMinutes)}</span>
            </label>
          ))}
        </div>
        {errors.serviceId && <p className="mt-2 text-sm text-red-700">{errors.serviceId}</p>}
      </fieldset>

      <fieldset>
        <legend className="text-base font-semibold text-slate-900">2. Pick a date and time</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="date" error={errors.date} hint="Monday to Saturday">
            <input
              id="date"
              type="date"
              min={minDate}
              max={maxDate}
              value={values.date}
              onChange={(e) => update("date", e.target.value)}
              aria-invalid={Boolean(errors.date)}
              className={inputClass}
            />
          </Field>
          <Field label="Start time" htmlFor="startTime" error={errors.startTime} hint={service ? undefined : "Choose a service first"}>
            <select
              id="startTime"
              value={values.startTime}
              onChange={(e) => update("startTime", e.target.value)}
              disabled={!service}
              aria-invalid={Boolean(errors.startTime)}
              className={inputClass}
            >
              <option value="">Select a time</option>
              {startTimes.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-semibold text-slate-900">3. Your details</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" error={errors.fullName}>
            <input id="fullName" autoComplete="name" value={values.fullName} onChange={(e) => update("fullName", e.target.value)} aria-invalid={Boolean(errors.fullName)} className={inputClass} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <input id="email" type="email" autoComplete="email" value={values.email} onChange={(e) => update("email", e.target.value)} aria-invalid={Boolean(errors.email)} className={inputClass} />
          </Field>
          <Field label="Phone (optional)" htmlFor="phone" error={errors.phone}>
            <input id="phone" type="tel" autoComplete="tel" value={values.phone} onChange={(e) => update("phone", e.target.value)} aria-invalid={Boolean(errors.phone)} className={inputClass} />
          </Field>
          <Field label="Service address" htmlFor="serviceAddress" error={errors.serviceAddress}>
            <input id="serviceAddress" autoComplete="street-address" value={values.serviceAddress} onChange={(e) => update("serviceAddress", e.target.value)} aria-invalid={Boolean(errors.serviceAddress)} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes (optional)" htmlFor="notes" error={errors.notes} hint="Access instructions, parking, anything we should know.">
              <textarea id="notes" rows={3} value={values.notes} onChange={(e) => update("notes", e.target.value)} aria-invalid={Boolean(errors.notes)} className={inputClass} />
            </Field>
          </div>
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
        {service && <span className="text-sm text-slate-600">Quote: {formatMoney(service.priceCents)}</span>}
        <Button type="submit" disabled={submitting} className="px-5">
          {submitting ? "Booking…" : "Confirm booking"}
        </Button>
      </div>
    </form>
  );
}
