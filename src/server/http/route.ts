import "server-only";
import { randomUUID } from "node:crypto";
import type { ApiErrorBody } from "@/shared/types";
import type { AuthUser } from "../auth/policy";
import { readCookie, SESSION_COOKIE } from "../auth/session-token";
import { AppError, errors } from "../errors";
import { describeError, logger } from "../logger";
import { authenticateSessionToken } from "../services/auth-service";

export interface RouteContext<P> {
  params: P;
  /** The signed-in user, or null. Each service decides whether that is allowed. */
  user: AuthUser | null;
  /** The raw session token, when one was sent. */
  sessionToken: string | undefined;
  requestId: string;
}

type Handler<P> = (request: Request, context: RouteContext<P>) => Promise<Response>;

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Wraps every API route with the same plumbing: request id, same-origin check
 * for state-changing requests, session lookup, and translation of errors into
 * a consistent JSON error shape.
 */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (request: Request, segment: { params: Promise<P> }): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    try {
      if (UNSAFE_METHODS.has(request.method)) assertSameOrigin(request);
      const sessionToken = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
      const user = await authenticateSessionToken(sessionToken);
      const response = await handler(request, {
        params: await segment.params,
        user,
        sessionToken,
        requestId,
      });
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(data, { ...init, headers });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw errors.invalidJson();
  }
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof AppError) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, requestId, ...(error.fields ? { fields: error.fields } : {}) },
    };
    return json(body, { status: error.status, headers: { "x-request-id": requestId } });
  }
  // Unexpected: log everything, reveal nothing.
  logger.error("unhandled error", { requestId, ...describeError(error) });
  const body: ApiErrorBody = {
    error: { code: "INTERNAL", message: "Something went wrong. Please try again.", requestId },
  };
  return json(body, { status: 500, headers: { "x-request-id": requestId } });
}

/**
 * Cross-site request forgery defence (in addition to SameSite cookies):
 * browsers always send an Origin header on cross-origin POSTs, so if one is
 * present it must match the host the request was sent to. Requests without an
 * Origin header come from non-browser clients, which cannot ride on a
 * victim's cookies.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | undefined;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = undefined;
  }
  if (!host || originHost !== host) throw errors.forbidden();
}
