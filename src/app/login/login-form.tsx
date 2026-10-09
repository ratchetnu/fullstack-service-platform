"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ApiError, apiFetch } from "@/components/api-client";
import { Alert, Button, Field, inputClass } from "@/components/ui";

// Seeded demo accounts (see scripts/seed.ts). Shown here because this is a public demo.
const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@example.com", password: "admin-demo-password", note: "can cancel jobs" },
  { label: "Staff", email: "staff@example.com", password: "staff-demo-password", note: "can start and complete jobs" },
];

export function LoginForm({ destination }: { destination: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }), retries: 0 });
      router.replace(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="mt-6 rounded-md bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
        <p className="font-medium text-slate-700">Demo accounts</p>
        <ul className="mt-2 space-y-2">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-medium">{account.label}</span> · {account.note}
              </span>
              <button
                type="button"
                className="rounded px-2 py-1 font-medium text-brand-700 hover:bg-brand-50"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
