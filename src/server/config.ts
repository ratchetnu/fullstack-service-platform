import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, { message: "DATABASE_URL is required" }),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),
  SESSION_COOKIE_SECURE: z.enum(["true", "false"]).optional(),
});

export interface AppConfig {
  databaseUrl: string;
  sessionTtlHours: number;
  secureCookies: boolean;
}

let cached: AppConfig | undefined;

/**
 * Reads configuration on first use rather than at import time, so `next build`
 * and unit tests do not need a database URL.
 */
export function getConfig(): AppConfig {
  if (cached) return cached;
  const env = envSchema.parse(process.env);
  cached = {
    databaseUrl: env.DATABASE_URL,
    sessionTtlHours: env.SESSION_TTL_HOURS,
    secureCookies: env.SESSION_COOKIE_SECURE
      ? env.SESSION_COOKIE_SECURE === "true"
      : env.NODE_ENV === "production",
  };
  return cached;
}
