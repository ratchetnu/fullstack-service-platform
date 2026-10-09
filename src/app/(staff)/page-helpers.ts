import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";

/** Renders the 404 page when a service reports that the record does not exist. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

/** Next passes repeated query parameters as arrays; we only use the first value. */
export function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
