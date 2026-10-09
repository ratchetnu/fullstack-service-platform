import { json, readJson, route } from "@/server/http/route";
import { createBooking, listBookings } from "@/server/services/booking-service";

/** Public. Requires an Idempotency-Key header; a retry with the same key returns the original booking. */
export const POST = route(async (request) => {
  const result = await createBooking(await readJson(request), request.headers.get("idempotency-key"));
  return json(
    { booking: result.booking },
    {
      status: result.replayed ? 200 : 201,
      headers: { "idempotent-replayed": String(result.replayed) },
    },
  );
});

/** Staff only. Query: ?status=scheduled&q=search&page=1 */
export const GET = route(async (request, { user }) => {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return json(await listBookings(user, query));
});
