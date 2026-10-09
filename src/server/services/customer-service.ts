import "server-only";
import { fieldErrors, listCustomersQuerySchema } from "@/shared/schemas";
import type { CustomerDetail, CustomerListItem, Page } from "@/shared/types";
import { type AuthUser, requirePermission } from "../auth/policy";
import { getPool } from "../db/pool";
import { errors } from "../errors";
import * as bookings from "../repositories/bookings";
import * as customers from "../repositories/customers";
import { parseId } from "./ids";

const PAGE_SIZE = 20;
const RECENT_BOOKINGS_LIMIT = 50;

export async function listCustomers(actor: AuthUser | null, query: unknown): Promise<Page<CustomerListItem>> {
  requirePermission(actor, "customers:read");
  const parsed = listCustomersQuerySchema.safeParse(query);
  if (!parsed.success) throw errors.validation(fieldErrors(parsed.error));

  const result = await customers.listCustomers(getPool(), {
    search: parsed.data.q,
    limit: PAGE_SIZE,
    offset: (parsed.data.page - 1) * PAGE_SIZE,
  });
  return { ...result, page: parsed.data.page, pageSize: PAGE_SIZE };
}

export async function getCustomer(actor: AuthUser | null, customerId: string): Promise<CustomerDetail> {
  requirePermission(actor, "customers:read");
  const id = parseId(customerId, "Customer");
  const pool = getPool();

  const customer = await customers.findCustomerById(pool, id);
  if (!customer) throw errors.notFound("Customer");

  const [stats, history] = await Promise.all([
    customers.customerStats(pool, id),
    bookings.listBookings(pool, { customerId: id, limit: RECENT_BOOKINGS_LIMIT }),
  ]);
  return {
    ...customer,
    stats,
    bookings: history.items.map(({ createdAt: _createdAt, ...item }) => item),
  };
}
