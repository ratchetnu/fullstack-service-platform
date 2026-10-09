import { serializeSessionCookie } from "@/server/auth/session-token";
import { getConfig } from "@/server/config";
import { json, readJson, route } from "@/server/http/route";
import { login } from "@/server/services/auth-service";

export const POST = route(async (request) => {
  const { user, token, expiresAt } = await login(await readJson(request));
  return json(
    { user },
    { headers: { "set-cookie": serializeSessionCookie(token, { expiresAt, secure: getConfig().secureCookies }) } },
  );
});
