import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageUser } from "@/server/auth/current-user";
import { safeRedirectPath } from "@/shared/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const destination = safeRedirectPath(typeof next === "string" ? next : undefined);
  if (await getPageUser()) redirect(destination);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center font-semibold text-slate-900">
          Service Platform
        </Link>
        <div className="mt-6 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-lg font-semibold">Staff sign in</h1>
          <LoginForm destination={destination} />
        </div>
      </div>
    </main>
  );
}
