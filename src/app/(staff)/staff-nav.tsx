"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/components/api-client";
import type { Role } from "@/shared/types";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bookings", label: "Bookings" },
  { href: "/customers", label: "Customers" },
];

export function StaffNav({ user }: { user: { displayName: string; role: Role } }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await apiFetch("/api/v1/auth/logout", { method: "POST", retries: 0 }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/dashboard" className="font-semibold text-slate-900">
          Service Platform
        </Link>
        <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-slate-700 sm:inline">{user.displayName}</span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium capitalize text-brand-700 ring-1 ring-brand-100">
            {user.role}
          </span>
          <button type="button" onClick={signOut} className="text-slate-600 hover:text-slate-900">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
