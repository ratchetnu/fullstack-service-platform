import { createHash, randomBytes } from "node:crypto";
import { SESSION_COOKIE } from "./cookie-name";

export { SESSION_COOKIE };

/** 256 bits of randomness, URL-safe. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored in the database. */
export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export function serializeSessionCookie(
  token: string,
  options: { expiresAt: Date; secure: boolean },
): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Expires=${options.expiresAt.toUTCString()}`,
    "HttpOnly", // not readable from JavaScript, so an XSS bug cannot steal it
    "SameSite=Lax", // not sent on cross-site form posts, which blocks most CSRF
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function serializeClearedSessionCookie(secure: boolean): string {
  return serializeSessionCookie("", { expiresAt: new Date(0), secure });
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === name) {
      const value = pair.slice(index + 1).trim();
      return value === "" ? undefined : value;
    }
  }
  return undefined;
}
