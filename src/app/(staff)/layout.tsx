import type { ReactNode } from "react";
import { requirePageUser } from "@/server/auth/current-user";
import { StaffNav } from "./staff-nav";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="min-h-screen">
      <StaffNav user={{ displayName: user.displayName, role: user.role }} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
