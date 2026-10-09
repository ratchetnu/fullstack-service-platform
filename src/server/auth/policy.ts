/**
 * Authorization: what each role may do. Permissions are checked in the service
 * layer — the code that actually reads or changes data — so every entry point
 * (API route, page, future background job) gets the same rules.
 */
import type { Role } from "@/shared/types";
import { errors } from "../errors";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export type Permission =
  | "dashboard:read"
  | "bookings:read"
  | "customers:read"
  | "jobs:progress" // start or complete a job
  | "jobs:cancel";

const STAFF_PERMISSIONS: readonly Permission[] = ["dashboard:read", "bookings:read", "customers:read", "jobs:progress"];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  staff: new Set(STAFF_PERMISSIONS),
  admin: new Set<Permission>([...STAFF_PERMISSIONS, "jobs:cancel"]),
};

export function hasPermission(user: AuthUser | null | undefined, permission: Permission): boolean {
  return user ? ROLE_PERMISSIONS[user.role].has(permission) : false;
}

/** Throws 401 when nobody is signed in, 403 when the signed-in user lacks the permission. */
export function requirePermission(
  user: AuthUser | null | undefined,
  permission: Permission,
): asserts user is AuthUser {
  if (!user) throw errors.unauthenticated();
  if (!hasPermission(user, permission)) throw errors.forbidden();
}
