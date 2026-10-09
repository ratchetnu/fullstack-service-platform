"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiFetch } from "@/components/api-client";
import { Alert, Button, inputClass } from "@/components/ui";
import { allowedTransitions, type JobStatus } from "@/shared/job-status";

const ACTION_LABELS: Partial<Record<JobStatus, string>> = {
  in_progress: "Start job",
  completed: "Mark completed",
};

export function JobActions({ jobId, status, version, canProgress, canCancel }: {
  jobId: string;
  status: JobStatus;
  version: number;
  canProgress: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<JobStatus | null>(null);
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const transitions = allowedTransitions(status);
  if (transitions.length === 0) {
    return <p className="text-sm text-slate-500">This job is finished. No further changes are possible.</p>;
  }

  async function transition(to: JobStatus) {
    setPending(to);
    setError(null);
    try {
      await apiFetch(`/api/v1/jobs/${jobId}/transitions`, {
        method: "POST",
        body: JSON.stringify({ to, expectedVersion: version, ...(to === "cancelled" ? { reason } : {}) }),
      });
      setCancelling(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { message: err.fields.reason ?? err.message, stale: err.code === "VERSION_CONFLICT" }
          : { message: "Something went wrong. Please try again.", stale: false },
      );
    } finally {
      setPending(null);
    }
  }

  const progressSteps = transitions.filter((to) => to !== "cancelled");
  const cancellable = transitions.includes("cancelled");

  return (
    <div className="space-y-3">
      {error && (
        <Alert>
          {error.message}{" "}
          {error.stale && (
            <button type="button" className="font-medium underline" onClick={() => router.refresh()}>
              Refresh
            </button>
          )}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {progressSteps.map((to) => (
          <Button key={to} onClick={() => transition(to)} disabled={!canProgress || pending !== null}>
            {pending === to ? "Saving…" : ACTION_LABELS[to]}
          </Button>
        ))}
        {cancellable && !cancelling && (
          <Button
            variant="danger"
            onClick={() => setCancelling(true)}
            disabled={!canCancel || pending !== null}
            title={canCancel ? undefined : "Only admins can cancel jobs"}
          >
            Cancel job
          </Button>
        )}
      </div>
      {cancellable && !canCancel && <p className="text-xs text-slate-500">Only admins can cancel jobs.</p>}

      {cancelling && (
        <div className="space-y-2 rounded-md bg-slate-50 p-3 ring-1 ring-slate-200">
          <label htmlFor="cancel-reason" className="block text-sm font-medium text-slate-800">
            Reason for cancelling
          </label>
          <textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => transition("cancelled")} disabled={pending !== null || reason.trim().length < 3}>
              {pending === "cancelled" ? "Cancelling…" : "Confirm cancellation"}
            </Button>
            <Button variant="ghost" onClick={() => setCancelling(false)} disabled={pending !== null}>
              Keep job
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
