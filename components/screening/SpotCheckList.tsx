"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { recordSpotCheckReview } from "@/app/actions/screening-actions";

type Row = {
  id: number;
  weekStart: string;
  source: string;
  applicationId: number;
  name: string;
  status: string;
  reviewedAt: string | null;
  outcome: string | null;
  note: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  POSSIBLE_FIT: "Possible fit",
  WEAK_EVIDENCE: "Weak evidence",
  NOT_MET: "Doesn't meet stated requirements",
  CLOSED_OUT: "Closed in a bulk close-out",
};

export default function SpotCheckList({ jobId, rows }: { jobId: number; rows: Row[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  async function review(row: Row, outcome: "PLACEMENT_OK" | "SHOULD_RECONSIDER") {
    setPending(row.id);
    setError(null);
    const result = await recordSpotCheckReview({ jobId, spotCheckId: row.id, outcome, note: notes[row.id] ?? "" });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (rows.length === 0) return <p className="mt-2 text-sm text-zinc-500">No sample yet. The daily job draws one each week once the job has a saved screening policy.</p>;

  return (
    <div className="mt-3 space-y-2 text-sm">
      {error ? <p role="alert" className="text-red-800">{error}</p> : null}
      <ul className="divide-y divide-zinc-100">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="w-28 text-xs text-zinc-500">Week of {new Date(row.weekStart).toLocaleDateString()}</span>
            <Link className="font-medium underline" href={`/dashboard/jobs/${jobId}/evaluation/${row.applicationId}`}>{row.name}</Link>
            <span className="text-xs text-zinc-500">{SOURCE_LABEL[row.source] ?? row.source} · {row.status.replace(/_/g, " ").toLowerCase()}</span>
            {row.reviewedAt ? (
              <span className="ml-auto text-xs">
                {row.outcome === "SHOULD_RECONSIDER" ? "Should be reconsidered" : "Placement looks right"}
                {row.note ? `: ${row.note}` : ""}
              </span>
            ) : (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <input
                  className="w-56 rounded border px-2 py-1 text-xs"
                  placeholder="Note (required to reconsider)"
                  value={notes[row.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))}
                />
                <button type="button" className="rounded border px-2 py-1 text-xs" disabled={pending === row.id} onClick={() => void review(row, "PLACEMENT_OK")}>Placement looks right</button>
                <button type="button" className="rounded border px-2 py-1 text-xs" disabled={pending === row.id} onClick={() => void review(row, "SHOULD_RECONSIDER")}>Should be reconsidered</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
