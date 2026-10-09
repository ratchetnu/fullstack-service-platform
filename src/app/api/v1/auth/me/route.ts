import { errors } from "@/server/errors";
import { json, route } from "@/server/http/route";

export const GET = route(async (_request, { user }) => {
  if (!user) throw errors.unauthenticated();
  return json({ user });
});
