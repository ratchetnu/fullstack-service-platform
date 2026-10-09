import { serializeClearedSessionCookie } from "@/server/auth/session-token";
import { getConfig } from "@/server/config";
import { route } from "@/server/http/route";
import { logout } from "@/server/services/auth-service";

export const POST = route(async (_request, { sessionToken }) => {
  await logout(sessionToken);
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": serializeClearedSessionCookie(getConfig().secureCookies) },
  });
});
