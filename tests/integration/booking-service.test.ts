import { describe, expect, it } from "vitest";
import { createBooking } from "@/server/services/booking-service";
import { bookingRequest, countRows, db, newKey, openDate, useDatabase } from "./helpers";

describe("createBooking", () => {
  const fixtures = useDatabase();

  it("creates the customer, booking, job and first history event together", async () => {
    const result = await createBooking(bookingRequest(fixtures().services.standard), newKey());

    expect(result.replayed).toBe(false);
    expect(result.booking).toMatchObject({ reference: expect.stringMatching(/^BK-[0-9A-Z]{8}$/), status: "scheduled" });
    expect(new Date(result.booking.scheduledEnd).getTime() - new Date(result.booking.scheduledStart).getTime()).toBe(120 * 60_000);
    expect(await countRows("customers")).toBe(1);
    expect(await countRows("bookings")).toBe(1);
    expect(await countRows("jobs")).toBe(1);

    const { rows } = await db().query(
      `SELECT e.from_status, e.to_status, e.actor_user_id, b.quoted_price_cents
         FROM job_status_events e JOIN jobs j ON j.id = e.job_id JOIN bookings b ON b.id = j.booking_id`,
    );
    expect(rows).toEqual([{ from_status: null, to_status: "scheduled", actor_user_id: null, quoted_price_cents: 14900 }]);
  });

  describe("idempotency", () => {
    it("returns the original booking when the same request is retried", async () => {
      const key = newKey();
      const request = bookingRequest(fixtures().services.standard);

      const first = await createBooking(request, key);
      const retry = await createBooking(request, key);

      expect(retry.replayed).toBe(true);
      expect(retry.booking).toEqual(first.booking);
      expect(await countRows("bookings")).toBe(1);
    });

    it("treats differently formatted but equivalent requests as the same request", async () => {
      const key = newKey();
      const request = bookingRequest(fixtures().services.standard);
      await createBooking(request, key);
      const retry = await createBooking(
        { ...request, customer: { ...request.customer, email: "  JORDAN@example.test " } },
        key,
      );
      expect(retry.replayed).toBe(true);
    });

    it("rejects a key reused for a different request", async () => {
      const key = newKey();
      await createBooking(bookingRequest(fixtures().services.standard), key);
      await expect(
        createBooking(bookingRequest(fixtures().services.standard, { startTime: "13:00" }), key),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 422 });
      expect(await countRows("bookings")).toBe(1);
    });

    it("creates exactly one booking when identical retries arrive at the same moment", async () => {
      const key = newKey();
      const request = bookingRequest(fixtures().services.standard);

      const results = await Promise.all(Array.from({ length: 8 }, () => createBooking(request, key)));

      expect(new Set(results.map((r) => r.booking.bookingId)).size).toBe(1);
      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
      expect(await countRows("bookings")).toBe(1);
      expect(await countRows("jobs")).toBe(1);
    });

    it("lets exactly one of two racing requests own a key, even for different days", async () => {
      const key = newKey();
      const service = fixtures().services.standard;
      const outcomes = await Promise.allSettled([
        createBooking(bookingRequest(service, { date: openDate(7) }), key),
        createBooking(bookingRequest(service, { date: openDate(14) }), key),
      ]);

      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find((o) => o.status === "rejected");
      expect(rejected?.reason).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
      expect(await countRows("bookings")).toBe(1);
    });

    it("requires a well-formed key", async () => {
      const request = bookingRequest(fixtures().services.standard);
      await expect(createBooking(request, null)).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
      await expect(createBooking(request, "short")).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    });
  });

  describe("capacity", () => {
    it("accepts as many overlapping jobs as there are crews, then refuses", async () => {
      const service = fixtures().services.standard;
      for (let i = 0; i < 3; i++) {
        await createBooking(bookingRequest(service, { customer: { fullName: `Customer ${i}`, email: `c${i}@example.test` } }), newKey());
      }
      await expect(
        createBooking(bookingRequest(service, { customer: { fullName: "Late Customer", email: "late@example.test" } }), newKey()),
      ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE", status: 409 });

      // A non-overlapping time on the same day is still available.
      await expect(createBooking(bookingRequest(service, { startTime: "14:00" }), newKey())).resolves.toMatchObject({ replayed: false });
    });

    it("never overbooks under concurrent load", async () => {
      const service = fixtures().services.standard;
      const outcomes = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          createBooking(bookingRequest(service, { customer: { fullName: `Racer ${i}`, email: `racer${i}@example.test` } }), newKey()),
        ),
      );

      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(3);
      for (const outcome of outcomes.filter((o) => o.status === "rejected")) {
        expect(outcome.reason).toMatchObject({ code: "SLOT_UNAVAILABLE" });
      }
      expect(await countRows("jobs")).toBe(3);
    });
  });

  describe("validation and business rules", () => {
    it("reports invalid fields without writing anything", async () => {
      await expect(
        createBooking({ ...bookingRequest(fixtures().services.standard), customer: { fullName: "", email: "x" } }, newKey()),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", fields: { "customer.fullName": expect.any(String), "customer.email": expect.any(String) } });
      expect(await countRows("customers")).toBe(0);
    });

    it("refuses services that are no longer offered", async () => {
      await expect(createBooking(bookingRequest(fixtures().services.retired), newKey())).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fields: { serviceId: "This service is not available." },
      });
    });

    it("applies opening hours using the service's duration", async () => {
      // 16:00 + 2 hours ends exactly at closing; 17:00 would run over.
      await expect(createBooking(bookingRequest(fixtures().services.standard, { startTime: "16:00" }), newKey())).resolves.toBeDefined();
      await expect(
        createBooking(bookingRequest(fixtures().services.standard, { startTime: "17:00" }), newKey()),
      ).rejects.toMatchObject({ code: "BUSINESS_RULE_VIOLATION", fields: { startTime: expect.any(String) } });
    });
  });

  describe("customers", () => {
    it("reuses an existing customer by email without overwriting their saved details", async () => {
      const service = fixtures().services.assessment;
      await createBooking(bookingRequest(service), newKey());
      await createBooking(
        bookingRequest(service, {
          startTime: "13:00",
          customer: { fullName: "Someone Else", email: "Jordan@Example.test", phone: "555-9999" },
        }),
        newKey(),
      );

      const { rows } = await db().query(`SELECT full_name, phone FROM customers`);
      expect(rows).toEqual([{ full_name: "Jordan Example", phone: "555-0100" }]);
      const { rows: bookings } = await db().query(`SELECT contact_name FROM bookings ORDER BY created_at`);
      expect(bookings.map((b) => b.contact_name)).toEqual(["Jordan Example", "Someone Else"]);
    });
  });

  describe("atomicity", () => {
    it("writes nothing if a later step fails", async () => {
      // Simulate a failure at the last step (creating the job) without touching application code.
      await db().query(`
        CREATE FUNCTION fail_job_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'simulated failure'; END $$;
        CREATE TRIGGER fail_job_insert BEFORE INSERT ON jobs FOR EACH ROW EXECUTE FUNCTION fail_job_insert();`);
      try {
        await expect(createBooking(bookingRequest(fixtures().services.standard), newKey())).rejects.toThrow("simulated failure");
        expect(await countRows("customers")).toBe(0);
        expect(await countRows("bookings")).toBe(0);
        expect(await countRows("jobs")).toBe(0);
      } finally {
        await db().query(`DROP TRIGGER fail_job_insert ON jobs; DROP FUNCTION fail_job_insert();`);
      }
    });
  });
});
