/**
 * Calls the real route handlers with real Request objects: HTTP status codes,
 * headers, cookies, and the JSON error format.
 */
import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { GET as getBooking } from "@/app/api/v1/bookings/[id]/route";
import { GET as listBookings, POST as createBooking } from "@/app/api/v1/bookings/route";
import { GET as getCustomer } from "@/app/api/v1/customers/[id]/route";
import { GET as dashboard } from "@/app/api/v1/dashboard/route";
import { POST as transition } from "@/app/api/v1/jobs/[id]/transitions/route";
import { GET as health } from "@/app/api/health/route";
import { bookingRequest, newKey, PASSWORDS, sessionCookieFor, useDatabase } from "./helpers";

const BASE = "http://app.test";

function request(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new Request(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { host: "app.test", "content-type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

const noParams = { params: Promise.resolve({}) } as { params: Promise<Record<string, never>> };
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

describe("HTTP API", () => {
  const fixtures = useDatabase();

  async function book(key = newKey(), body: unknown = bookingRequest(fixtures().services.standard)) {
    return createBooking(request("/api/v1/bookings", { method: "POST", body, headers: { "idempotency-key": key } }), noParams);
  }

  describe("POST /api/v1/bookings", () => {
    it("returns 201 for a new booking and 200 with a replay header for a retry", async () => {
      const key = newKey();
      const first = await book(key);
      expect(first.status).toBe(201);
      expect(first.headers.get("idempotent-replayed")).toBe("false");
      expect(first.headers.get("x-request-id")).toBeTruthy();
      const { booking } = await first.json();

      const retry = await book(key);
      expect(retry.status).toBe(200);
      expect(retry.headers.get("idempotent-replayed")).toBe("true");
      expect((await retry.json()).booking).toEqual(booking);
    });

    it("requires an Idempotency-Key header", async () => {
      const response = await createBooking(
        request("/api/v1/bookings", { method: "POST", body: bookingRequest(fixtures().services.standard) }),
        noParams,
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("returns field-level errors in a consistent shape", async () => {
      const response = await book(newKey(), { ...bookingRequest(fixtures().services.standard), serviceAddress: "" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "VALIDATION_FAILED",
          message: "Some fields are invalid.",
          fields: { serviceAddress: "Please enter the address where the work will happen." },
          requestId: expect.any(String),
        },
      });
    });

    it("rejects malformed JSON", async () => {
      const response = await book(newKey(), "{not json");
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_JSON");
    });

    it("rejects cross-site requests", async () => {
      const response = await createBooking(
        request("/api/v1/bookings", {
          method: "POST",
          body: bookingRequest(fixtures().services.standard),
          headers: { "idempotency-key": newKey(), origin: "https://elsewhere.test" },
        }),
        noParams,
      );
      expect(response.status).toBe(403);
    });
  });

  describe("authentication and authorization", () => {
    it("sets an HttpOnly session cookie on sign-in", async () => {
      const response = await login(
        request("/api/v1/auth/login", { method: "POST", body: { email: "staff@example.test", password: PASSWORDS.staff } }),
        noParams,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toMatch(/^sp_session=[\w-]+; Path=\/; Expires=.+; HttpOnly; SameSite=Lax/);
    });

    it("returns 401 for staff endpoints without a session", async () => {
      for (const response of [
        await listBookings(request("/api/v1/bookings"), noParams),
        await dashboard(request("/api/v1/dashboard"), noParams),
      ]) {
        expect(response.status).toBe(401);
        expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
      }
    });

    it("returns 403 when staff try an admin-only action", async () => {
      const { booking } = await (await book()).json();
      const cookie = await sessionCookieFor("staff");
      const detail = await (await getBooking(request(`/api/v1/bookings/${booking.bookingId}`, { headers: { cookie } }), withId(booking.bookingId))).json();

      const response = await transition(
        request(`/api/v1/jobs/${detail.booking.job.id}/transitions`, {
          method: "POST",
          headers: { cookie },
          body: { to: "cancelled", expectedVersion: 1, reason: "Testing" },
        }),
        withId(detail.booking.job.id),
      );
      expect(response.status).toBe(403);
    });
  });

  describe("staff reads", () => {
    it("lists, filters and paginates bookings", async () => {
      await book();
      const cookie = await sessionCookieFor("staff");

      const all = await (await listBookings(request("/api/v1/bookings", { headers: { cookie } }), noParams)).json();
      expect(all).toMatchObject({ page: 1, pageSize: 20, total: 1, items: [{ customerName: "Jordan Example", status: "scheduled" }] });

      const completed = await (await listBookings(request("/api/v1/bookings?status=completed", { headers: { cookie } }), noParams)).json();
      expect(completed.total).toBe(0);

      const bad = await listBookings(request("/api/v1/bookings?status=nonsense", { headers: { cookie } }), noParams);
      expect(bad.status).toBe(400);
    });

    it("returns customer detail with history and returns 404 for unknown ids", async () => {
      const { booking } = await (await book()).json();
      const cookie = await sessionCookieFor("staff");
      const detail = await (await getBooking(request(`/api/v1/bookings/${booking.bookingId}`, { headers: { cookie } }), withId(booking.bookingId))).json();

      const customer = await getCustomer(request(`/api/v1/customers/${detail.booking.customer.id}`, { headers: { cookie } }), withId(detail.booking.customer.id));
      expect(customer.status).toBe(200);
      expect((await customer.json()).customer).toMatchObject({ fullName: "Jordan Example", stats: { bookings: 1 } });

      const missing = await getCustomer(request(`/api/v1/customers/nope`, { headers: { cookie } }), withId("nope"));
      expect(missing.status).toBe(404);
    });
  });

  it("reports health", async () => {
    const response = await health();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
