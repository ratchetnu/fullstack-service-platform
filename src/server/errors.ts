/**
 * Every expected failure is an AppError with a stable machine-readable code and
 * an HTTP status. Anything else is treated as a bug: logged, and reported to
 * the client as a generic 500 without internal details.
 */

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "INVALID_JSON"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "BUSINESS_RULE_VIOLATION"
  | "SLOT_UNAVAILABLE"
  | "INVALID_TRANSITION"
  | "VERSION_CONFLICT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  validation: (fields: Record<string, string>, message = "Some fields are invalid.") =>
    new AppError("VALIDATION_FAILED", message, 400, fields),
  invalidJson: () => new AppError("INVALID_JSON", "Request body must be valid JSON.", 400),
  idempotencyKeyRequired: (message = "An Idempotency-Key header is required.") =>
    new AppError("IDEMPOTENCY_KEY_REQUIRED", message, 400),
  idempotencyKeyReused: () =>
    new AppError(
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used for a different request. Use a new key for a new booking.",
      422,
    ),
  businessRule: (message: string, fields?: Record<string, string>) =>
    new AppError("BUSINESS_RULE_VIOLATION", message, 422, fields),
  slotUnavailable: () =>
    new AppError("SLOT_UNAVAILABLE", "That time is fully booked. Please choose another time.", 409, {
      startTime: "Fully booked",
    }),
  invalidTransition: (from: string, to: string) =>
    new AppError("INVALID_TRANSITION", `A job that is ${from} cannot be moved to ${to}.`, 409),
  versionConflict: () =>
    new AppError(
      "VERSION_CONFLICT",
      "This job was changed by someone else. Refresh to see the latest version.",
      409,
    ),
  unauthenticated: (message = "Please sign in.") => new AppError("UNAUTHENTICATED", message, 401),
  forbidden: () => new AppError("FORBIDDEN", "You do not have permission to do that.", 403),
  notFound: (resource: string) => new AppError("NOT_FOUND", `${resource} not found.`, 404),
};

/** Postgres error codes we react to. https://www.postgresql.org/docs/current/errcodes-appendix.html */
export const PG = {
  uniqueViolation: "23505",
  serializationFailure: "40001",
  deadlockDetected: "40P01",
} as const;

export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    pgErrorCode(error) === PG.uniqueViolation &&
    typeof error === "object" &&
    error !== null &&
    "constraint" in error &&
    error.constraint === constraint
  );
}
