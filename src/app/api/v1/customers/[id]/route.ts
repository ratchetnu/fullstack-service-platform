import { json, route } from "@/server/http/route";
import { getCustomer } from "@/server/services/customer-service";

export const GET = route<{ id: string }>(async (_request, { user, params }) =>
  json({ customer: await getCustomer(user, params.id) }),
);
