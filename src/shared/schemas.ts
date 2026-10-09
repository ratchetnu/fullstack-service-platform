/**
 * Request schemas shared by the browser (instant feedback) and the server
 * (the real check). The server never trusts that the browser validated.
 */
import { z } from "zod";
import { JOB_STATUSES } from "./job-status";
import { isValidLocalDate, isValidLocalTime } from "./time";

/** Treats empty or whitespace-only strings as "not provided". */
function optionalText<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

export const createBookingSchema = z.object({
  serviceId: z.uuid({ message: "Please choose a service." }),
  date: z.string().refine(isValidLocalDate, { message: "Please choose a valid date." }),
  startTime: z.string().refine(isValidLocalTime, { message: "Please choose a start time." }),
  customer: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, { message: "Please enter your name." })
      .max(120, { message: "Name must be 120 characters or fewer." }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, { message: "Email is too long." })
      .pipe(z.email({ message: "Please enter a valid email address." })),
    phone: optionalText(
      z
        .string()
        .trim()
        .regex(/^[0-9+().\-\s]{7,20}$/, { message: "Please enter a valid phone number." }),
    ),
  }),
  serviceAddress: z
    .string()
    .trim()
    .min(5, { message: "Please enter the address where the work will happen." })
    .max(200, { message: "Address must be 200 characters or fewer." }),
  notes: optionalText(z.string().trim().max(1000, { message: "Notes must be 1000 characters or fewer." })),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CreateBookingFormValues = z.input<typeof createBookingSchema>;

export const jobTransitionSchema = z
  .object({
    to: z.enum(JOB_STATUSES),
    expectedVersion: z.int().positive(),
    reason: optionalText(z.string().trim().min(3).max(500)),
  })
  .refine((value) => value.to !== "cancelled" || value.reason !== undefined, {
    message: "A reason is required to cancel a job.",
    path: ["reason"],
  });

export type JobTransitionInput = z.infer<typeof jobTransitionSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ message: "Please enter a valid email address." })),
  password: z.string().min(1, { message: "Please enter your password." }).max(200),
});

export const listBookingsQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  q: optionalText(z.string().trim().max(100)),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

export const listCustomersQuerySchema = z.object({
  q: optionalText(z.string().trim().max(100)),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

/** Idempotency keys come from the `Idempotency-Key` header. A UUID is typical. */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,100}$/, {
    message: "Idempotency-Key must be 16-100 characters of letters, digits, '-' or '_'.",
  });

/** Turns a ZodError into `{ "customer.email": "message" }` for forms and API responses. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    result[key] ??= issue.message;
  }
  return result;
}
