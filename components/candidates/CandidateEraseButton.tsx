"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  candidateId: number;
  candidateName: string;
};

/**
 * GDPR Article 17 erasure trigger. Double-confirmed: the second step
 * requires typing ERASE. Irreversible.
 */
export default function CandidateEraseButton({
  candidateId,
  candidateName,
}: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "confirm">("idle");
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onErase() {
    setError(null);
    const res = await fetch(`/api/candidates/${candidateId}/erase`, {
      method: "POST",
    });
    if (res.ok) {
      startTransition(() => {
        router.refresh();
      });
      setStage("idle");
      setError(null);
      window.location.assign("/dashboard/candidates");
      return;
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setError(body?.error ?? "Erasure failed.");
  }

  if (stage !== "confirm") {
    return (
      <button
        type="button"
        onClick={() => setStage("confirm")}
        className="text-xs font-medium text-red-600 underline underline-offset-2 hover:text-red-500"
      >
        Erase personal data (GDPR)
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4 text-left">
      <p className="text-sm font-semibold text-red-900">
        Erase all personal data for {candidateName}?
      </p>
      <ul className="list-disc pl-5 text-xs text-red-800">
        <li>Name, employer, skills, contact and profile fields are scrubbed.</li>
        <li>Resume files are deleted from storage.</li>
        <li>Scores, statuses, dates and content hashes are preserved for audit.</li>
        <li>This action is irreversible.</li>
      </ul>
      <label className="block text-xs font-medium text-zinc-700">
        Type <span className="font-mono font-bold">ERASE</span> to confirm:
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-sm"
          autoComplete="off"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || confirmText !== "ERASE"}
          onClick={onErase}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Erasing…" : "Confirm erasure"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmText("");
            setStage("idle");
          }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
