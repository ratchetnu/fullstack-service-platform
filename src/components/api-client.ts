/**
 * Browser-side fetch helper. Network failures and gateway errors (502/503/504)
 * are retried a couple of times. That is only safe because every request it is
 * used for is retry-safe on the server: bookings carry an idempotency key, and
 * job transitions are no-ops when repeated.
 */
import type { ApiErrorBody } from "@/shared/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

export async function apiFetch<T>(
  url: string,
  init: RequestInit & { retries?: number } = {},
): Promise<T> {
  const { retries = 2, ...requestInit } = init;
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...requestInit,
        headers: { "content-type": "application/json", ...requestInit.headers },
      });
    } catch {
      if (attempt < retries) {
        await delay(attempt);
        continue;
      }
      throw new ApiError(0, "NETWORK", "Could not reach the server. Check your connection and try again.");
    }

    if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
      await delay(attempt);
      continue;
    }
    if (response.status === 204) return undefined as T;

    const body = (await response.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        body?.error?.code ?? "UNKNOWN",
        body?.error?.message ?? "Something went wrong. Please try again.",
        body?.error?.fields,
      );
    }
    return body as T;
  }
}

function delay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
}
