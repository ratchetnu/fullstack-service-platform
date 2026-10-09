import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateSessionToken } from "../services/auth-service";
import type { AuthUser } from "./policy";
import { SESSION_COOKIE } from "./session-token";

/** The signed-in user for a server-rendered page, or null. */
export async function getPageUser(): Promise<AuthUser | null> {
  const store = await cookies();
  return authenticateSessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * For staff pages. Sends visitors without a valid session to sign in.
 * This is about navigation; permission checks still happen in the services.
 */
export async function requirePageUser(): Promise<AuthUser> {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return user;
}
