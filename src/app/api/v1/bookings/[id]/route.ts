import { json, route } from "@/server/http/route";
import { getBooking } from "@/server/services/booking-service";

export const GET = route<{ id: string }>(async (_request, { user, params }) =>
  json({ booking: await getBooking(user, params.id) }),
);
