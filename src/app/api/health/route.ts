import { getPool } from "@/server/db/pool";
import { describeError, logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/** Liveness and database readiness, for load balancers and uptime checks. */
export async function GET(): Promise<Response> {
  try {
    await getPool().query("SELECT 1");
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logger.error("health check failed", describeError(error));
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
