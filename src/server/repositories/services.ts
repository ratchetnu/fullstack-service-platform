import type { ServiceOption } from "@/shared/types";
import type { Queryable } from "../db/pool";

interface ServiceRow {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
}

export interface ServiceRecord extends ServiceOption {
  active: boolean;
}

function toService(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    active: row.active,
  };
}

export async function listActiveServices(db: Queryable): Promise<ServiceOption[]> {
  const { rows } = await db.query<ServiceRow>(
    `SELECT id, name, description, duration_minutes, price_cents, active
       FROM services
      WHERE active
      ORDER BY price_cents, name`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
  }));
}

export async function findServiceById(db: Queryable, id: string): Promise<ServiceRecord | null> {
  const { rows } = await db.query<ServiceRow>(
    `SELECT id, name, description, duration_minutes, price_cents, active FROM services WHERE id = $1`,
    [id],
  );
  return rows[0] ? toService(rows[0]) : null;
}
