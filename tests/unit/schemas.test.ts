import { describe, expect, it } from "vitest";
import { createBookingSchema, fieldErrors, idempotencyKeySchema, jobTransitionSchema } from "@/shared/schemas";

const valid = {
  serviceId: "6f1c3c2e-9b1a-4c55-9d43-2a3b4c5d6e7f",
  date: "2026-06-03",
  startTime: "10:00",
  customer: { fullName: "  Jordan Example ", email: " Jordan@Example.COM ", phone: "" },
  serviceAddress: "12 Sample Street",
  notes: "   ",
};

describe("createBookingSchema", () => {
  it("normalises input", () => {
    const result = createBookingSchema.parse(valid);
    expect(result.customer).toEqual({ fullName: "Jordan Example", email: "jordan@example.com", phone: undefined });
    expect(result.notes).toBeUndefined();
  });

  it("reports every invalid field with a readable message", () => {
    const result = createBookingSchema.safeParse({
      ...valid,
      serviceId: "not-a-uuid",
      date: "2026-02-30",
      customer: { fullName: "J", email: "nope", phone: "abc" },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({
      serviceId: "Please choose a service.",
      date: "Please choose a valid date.",
      "customer.fullName": "Please enter your name.",
      "customer.email": "Please enter a valid email address.",
      "customer.phone": "Please enter a valid phone number.",
    });
  });

  it("rejects overly long notes", () => {
    expect(createBookingSchema.safeParse({ ...valid, notes: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("jobTransitionSchema", () => {
  it("requires a reason to cancel", () => {
    const result = jobTransitionSchema.safeParse({ to: "cancelled", expectedVersion: 1 });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)).toEqual({ reason: "A reason is required to cancel a job." });
  });

  it("does not require a reason for other transitions", () => {
    expect(jobTransitionSchema.parse({ to: "in_progress", expectedVersion: 3 })).toEqual({ to: "in_progress", expectedVersion: 3 });
  });

  it("rejects unknown statuses and non-integer versions", () => {
    expect(jobTransitionSchema.safeParse({ to: "done", expectedVersion: 1 }).success).toBe(false);
    expect(jobTransitionSchema.safeParse({ to: "completed", expectedVersion: 1.5 }).success).toBe(false);
  });
});

describe("idempotencyKeySchema", () => {
  it("accepts UUIDs and similar opaque keys", () => {
    expect(idempotencyKeySchema.safeParse("0b7d3a52-4b8f-4e3c-9e57-7a4a3f0f2d11").success).toBe(true);
  });

  it("rejects short or unusual keys", () => {
    expect(idempotencyKeySchema.safeParse("abc").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("has spaces in it, too long?").success).toBe(false);
  });
});
