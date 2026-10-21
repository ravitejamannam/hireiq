"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { approveReviewCloseOut, cancelReviewCloseOut } from "@/app/actions/review-queue-actions";

export default function PendingCloseOutActions({ jobId, batchId, count }: { jobId: number; batchId: number; count: number }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(approve: boolean) {
    setPending(true);
    setError(null);
    const result = approve
      ? await approveReviewCloseOut({ jobId, batchId, confirmCount: Number(confirmText) })
      : await cancelReviewCloseOut({ jobId, batchId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>Waiting for approval.</span>
      <label className="text-xs">
        Type {count} to approve
        <input className="ml-1 w-16 rounded border px-1" inputMode="numeric" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
      </label>
      <button
        type="button"
        className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
        disabled={pending || confirmText !== String(count)}
        onClick={() => void finish(true)}
      >
        Approve
      </button>
      <button type="button" className="rounded border px-2 py-0.5 text-xs" disabled={pending} onClick={() => void finish(false)}>
        Cancel
      </button>
      {error ? <span role="alert" className="text-xs text-red-800">{error}</span> : null}
    </span>
  );
}
