import { z } from "zod";
import { errors } from "../errors";

const uuid = z.uuid();

/**
 * Ids arrive in URLs. Anything that is not a UUID cannot exist, so it is a 404
 * (rather than letting Postgres reject the cast and surfacing a 500).
 */
export function parseId(value: string, resource: string): string {
  if (!uuid.safeParse(value).success) throw errors.notFound(resource);
  return value;
}
