"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { bulkTransitionApplications } from "@/app/actions/application-actions";

type AppRow = {
  id: number;
  status: string;
  name: string;
  expertScore: number | null;
};

type BulkAction = "SHORTLISTED" | "REJECTED";

export default function BulkActionsBar({ selected }: { selected: AppRow[] }) {
  const router = useRouter();
  const [action, setAction] = useState<BulkAction | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const count = selected.length;
  if (count === 0) return null;

  async function onApply() {
    if (!action) return;
    if (action === "REJECTED" && !rejectionReason.trim()) {
      alert("Please provide a rejection reason.");
      return;
    }
    const ids = selected.map((s) => s.id);
    startTransition(async () => {
      await bulkTransitionApplications({
        ids,
        nextStatus: action,
        rejectionReason: action === "REJECTED" ? rejectionReason : undefined,
      });
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setAction(null);
        setRejectionReason("");
        router.refresh();
      }, 1500);
    });
  }

  if (done) {
    return (
      <div className="sticky bottom-4 z-10 mx-auto max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-3 text-center text-sm font-medium text-emerald-800 shadow-lg">
        ✓ {count} application{count > 1 ? "s" : ""} updated.
      </div>
    );
  }

  return (
    <div className="sticky bottom-4 z-10 rounded-xl border border-indigo-200 bg-white px-6 py-3 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-700">
          {count} selected
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {/* Action selector */}
          <select
            value={action ?? ""}
            onChange={(e) => setAction(e.target.value as BulkAction || null)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Choose action…</option>
            <option value="SHORTLISTED">Move to Shortlisted</option>
            <option value="REJECTED">Reject</option>
          </select>

          {/* Rejection reason */}
          {action === "REJECTED" && (
            <input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason (required)"
              maxLength={120}
              className="w-48 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          )}

          {/* Apply */}
          <button
            type="button"
            onClick={onApply}
            disabled={!action || isPending}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {isPending ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
