import "server-only";
import type { ServiceOption } from "@/shared/types";
import { getPool } from "../db/pool";
import { listActiveServices } from "../repositories/services";

/** Public: the services a customer can book. */
export function listBookableServices(): Promise<ServiceOption[]> {
  return listActiveServices(getPool());
}
