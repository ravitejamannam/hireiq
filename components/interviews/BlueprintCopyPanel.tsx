"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { copyBlueprintFromRequirement } from "@/app/actions/blueprint-actions";

type SourceOption = {
  specVersionId: number;
  jobTitle: string;
  requirementId: number;
  competencyCount: number;
};

export default function BlueprintCopyPanel({
  targetSpecVersionId,
  sources,
}: {
  targetSpecVersionId: number;
  sources: SourceOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function onCopy() {
    const sourceSpecVersionId = Number(selected);
    if (!sourceSpecVersionId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await copyBlueprintFromRequirement({
        sourceSpecVersionId,
        targetSpecVersionId,
      });
      if (result.ok) {
        setMessage({
          ok: true,
          text: `Copied ${result.blueprint.competencies.length} competencies from "${result.blueprint.jobSpecificationVersionId ? "source" : ""}". Review below and save.`,
        });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  if (sources.length === 0) return null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
      <h2 className="font-semibold text-indigo-900">Copy an existing rubric</h2>
      <p className="mt-1 text-sm text-indigo-800">
        Start from another requirement&apos;s blueprint, then adjust here.
        Copying replaces the draft below.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Choose requirement…</option>
          {sources.map((s) => (
            <option key={s.specVersionId} value={s.specVersionId}>
              {s.jobTitle} ({s.competencyCount} competencies)
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCopy}
          disabled={!selected || isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {isPending ? "Copying…" : "Copy"}
        </button>
      </div>
      {message ? (
        <p className={`mt-2 text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
