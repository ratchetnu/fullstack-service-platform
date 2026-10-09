import type { CustomerListItem } from "@/shared/types";
import type { Queryable } from "../db/pool";
import { containsPattern, iso } from "./sql";

export interface CustomerRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  createdAt: string;
}

/**
 * Returns the id of the customer with this email, creating the customer if
 * they are new. An existing customer's saved details are never changed here:
 * the booking form is public, so anyone could type someone else's email.
 */
export async function findOrCreateCustomer(
  db: Queryable,
  customer: { fullName: string; email: string; phone?: string | undefined },
): Promise<string> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO customers (full_name, email, phone)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [customer.fullName, customer.email, customer.phone ?? null],
  );
  if (inserted.rows[0]) return inserted.rows[0].id;

  const existing = await db.query<{ id: string }>(`SELECT id FROM customers WHERE email = $1`, [customer.email]);
  if (!existing.rows[0]) throw new Error("Customer vanished between insert and select");
  return existing.rows[0].id;
}

export async function findCustomerById(db: Queryable, id: string): Promise<CustomerRecord | null> {
  const { rows } = await db.query<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    created_at: Date;
  }>(`SELECT id, full_name, email, phone, created_at FROM customers WHERE id = $1`, [id]);
  const row = rows[0];
  return row
    ? { id: row.id, fullName: row.full_name, email: row.email, phone: row.phone, createdAt: iso(row.created_at) }
    : null;
}

export async function listCustomers(
  db: Queryable,
  filter: { search?: string | undefined; limit: number; offset: number },
): Promise<{ items: CustomerListItem[]; total: number }> {
  const pattern = filter.search ? containsPattern(filter.search) : null;
  const where = `($1::text IS NULL OR c.full_name ILIKE $1 OR c.email ILIKE $1)`;

  const [list, count] = await Promise.all([
    db.query<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      booking_count: number;
      last_scheduled_start: Date | null;
    }>(
      `SELECT c.id, c.full_name, c.email, c.phone,
              count(b.id)::int AS booking_count,
              max(j.scheduled_start) AS last_scheduled_start
         FROM customers c
         LEFT JOIN bookings b ON b.customer_id = c.id
         LEFT JOIN jobs j ON j.booking_id = b.id
        WHERE ${where}
        GROUP BY c.id
        ORDER BY c.full_name, c.id
        LIMIT $2 OFFSET $3`,
      [pattern, filter.limit, filter.offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM customers c WHERE ${where}`, [pattern]),
  ]);

  return {
    items: list.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      bookingCount: row.booking_count,
      lastScheduledStart: iso(row.last_scheduled_start),
    })),
    total: count.rows[0]?.total ?? 0,
  };
}

export async function customerStats(
  db: Queryable,
  customerId: string,
): Promise<{ bookings: number; completed: number; cancelled: number; completedValueCents: number }> {
  const { rows } = await db.query<{
    bookings: number;
    completed: number;
    cancelled: number;
    completed_value_cents: number;
  }>(
    `SELECT count(*)::int AS bookings,
            count(*) FILTER (WHERE j.status = 'completed')::int AS completed,
            count(*) FILTER (WHERE j.status = 'cancelled')::int AS cancelled,
            coalesce(sum(b.quoted_price_cents) FILTER (WHERE j.status = 'completed'), 0)::int AS completed_value_cents
       FROM bookings b
       JOIN jobs j ON j.booking_id = b.id
      WHERE b.customer_id = $1`,
    [customerId],
  );
  const row = rows[0];
  return {
    bookings: row?.bookings ?? 0,
    completed: row?.completed ?? 0,
    cancelled: row?.cancelled ?? 0,
    completedValueCents: row?.completed_value_cents ?? 0,
  };
}
