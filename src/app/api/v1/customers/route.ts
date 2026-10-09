import { json, route } from "@/server/http/route";
import { listCustomers } from "@/server/services/customer-service";

export const GET = route(async (request, { user }) => {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return json(await listCustomers(user, query));
});
