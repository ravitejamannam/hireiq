"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveJobScreeningPolicy } from "@/app/actions/screening-actions";
import type { RubricCriterion, ScreeningPolicyInput } from "@/lib/screening/screening-policy";

type NumberField = "basicWeight" | "practicalWeight" | "evidenceWeight" | "borderlineBandPercent" | "reviewCapacity" | "practicalDeadlineDays";

function toInt(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function optionalInt(value: string) {
  return value.trim() === "" ? null : toInt(value);
}

export default function ScreeningPolicyForm({ jobId, initial }: { jobId: number; initial: ScreeningPolicyInput }) {
  const router = useRouter();
  const [values, setValues] = useState(() => ({
    basicWeight: String(initial.basicWeight),
    practicalWeight: String(initial.practicalWeight),
    evidenceWeight: String(initial.evidenceWeight),
    basicPassPercent: initial.basicPassPercent === null ? "" : String(initial.basicPassPercent),
    practicalPassPercent: initial.practicalPassPercent === null ? "" : String(initial.practicalPassPercent),
    borderlineBandPercent: String(initial.borderlineBandPercent),
    reviewCapacity: String(initial.reviewCapacity),
    practicalTitle: initial.practicalTitle ?? "",
    practicalInstructions: initial.practicalInstructions ?? "",
    practicalEstimatedMinutes: initial.practicalEstimatedMinutes === null ? "" : String(initial.practicalEstimatedMinutes),
    practicalAllowedResources: initial.practicalAllowedResources ?? "",
    practicalDeadlineDays: String(initial.practicalDeadlineDays),
    practicalCompensationNote: initial.practicalCompensationNote ?? "",
  }));
  const [rubric, setRubric] = useState<Array<Omit<RubricCriterion, "maxPoints"> & { maxPoints: string }>>(() =>
    initial.practicalRubric.map((row) => ({ ...row, maxPoints: String(row.maxPoints) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const total = toInt(values.basicWeight) + toInt(values.practicalWeight) + toInt(values.evidenceWeight);

  function set(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const payload = {
      basicWeight: toInt(values.basicWeight),
      practicalWeight: toInt(values.practicalWeight),
      evidenceWeight: toInt(values.evidenceWeight),
      basicPassPercent: optionalInt(values.basicPassPercent),
      practicalPassPercent: optionalInt(values.practicalPassPercent),
      borderlineBandPercent: toInt(values.borderlineBandPercent),
      reviewCapacity: toInt(values.reviewCapacity),
      practicalTitle: values.practicalTitle || null,
      practicalInstructions: values.practicalInstructions || null,
      practicalEstimatedMinutes: optionalInt(values.practicalEstimatedMinutes),
      practicalAllowedResources: values.practicalAllowedResources || null,
      practicalDeadlineDays: toInt(values.practicalDeadlineDays),
      practicalCompensationNote: values.practicalCompensationNote || null,
      practicalRubric: rubric.map((row) => ({ key: row.key, label: row.label, description: row.description, maxPoints: toInt(row.maxPoints) })),
    };
    const result = await saveJobScreeningPolicy({ jobId, values: payload });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(`Saved as version ${result.version}. The review queue now uses it.`);
    router.refresh();
  }

  const numberInput = (key: NumberField | "basicPassPercent" | "practicalPassPercent" | "practicalEstimatedMinutes", label: string, hint?: string) => (
    <label className="flex flex-col text-sm">
      <span className="font-medium">{label}</span>
      {hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
      <input type="number" inputMode="numeric" value={values[key]} onChange={(event) => set(key, event.target.value)} className="mt-1 w-28 rounded border px-2 py-1" />
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="font-semibold">Weights</legend>
        <p className="text-xs text-zinc-500">Must add to 100. Set a weight to 0 to leave a component out of the combined score. 30/50/20 (quick assessment / practical / resume evidence) is an illustrative starting point, not a validated rule.</p>
        <div className="flex flex-wrap gap-4">
          {numberInput("basicWeight", "Basic assessment %")}
          {numberInput("practicalWeight", "Practical %")}
          {numberInput("evidenceWeight", "Resume evidence %")}
        </div>
        <p className={`text-sm ${total === 100 ? "text-zinc-600" : "text-red-700"}`}>Total: {Number.isNaN(total) ? "—" : total}</p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Standard and capacity</legend>
        <div className="flex flex-wrap gap-4">
          {numberInput("basicPassPercent", "Basic pass mark %", "Blank = no threshold")}
          {numberInput("practicalPassPercent", "Practical pass mark %", "Blank = no threshold")}
          {numberInput("borderlineBandPercent", "Borderline band", "Points below a pass mark")}
          {numberInput("reviewCapacity", "Review capacity", "Candidates you can review first")}
        </div>
        <p className="text-xs text-zinc-500">Capacity never lowers the standard. If fewer candidates qualify, the queue says so instead of filling the list.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold">Practical assessment</legend>
        <label className="flex flex-col text-sm">
          <span className="font-medium">Title</span>
          <input value={values.practicalTitle} onChange={(event) => set("practicalTitle", event.target.value)} maxLength={160} className="mt-1 rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          <span className="font-medium">Task instructions</span>
          <span className="text-xs text-zinc-500">Shown to the candidate. Keep it close to real work for this role and bounded in scope.</span>
          <textarea value={values.practicalInstructions} onChange={(event) => set("practicalInstructions", event.target.value)} rows={6} maxLength={8000} className="mt-1 rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col text-sm">
          <span className="font-medium">Allowed resources</span>
          <textarea value={values.practicalAllowedResources} onChange={(event) => set("practicalAllowedResources", event.target.value)} rows={2} maxLength={2000} className="mt-1 rounded border px-2 py-1" />
        </label>
        <div className="flex flex-wrap gap-4">
          {numberInput("practicalEstimatedMinutes", "Expected effort (minutes)")}
          {numberInput("practicalDeadlineDays", "Deadline (days)")}
        </div>
        <label className="flex flex-col text-sm">
          <span className="font-medium">Compensation note</span>
          <span className="text-xs text-zinc-500">Optional, e.g. whether longer tasks are paid.</span>
          <input value={values.practicalCompensationNote} onChange={(event) => set("practicalCompensationNote", event.target.value)} maxLength={1000} className="mt-1 rounded border px-2 py-1" />
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Rubric</legend>
        <p className="text-xs text-zinc-500">Candidates see these criteria. Each needs a reviewer score before the practical result is final.</p>
        {rubric.map((row, index) => (
          <div key={index} className="grid gap-2 rounded border border-zinc-200 p-2 sm:grid-cols-[8rem_1fr_5rem_auto]">
            <input aria-label="Key" value={row.key} onChange={(event) => setRubric((rows) => rows.map((item, i) => (i === index ? { ...item, key: event.target.value.toLowerCase() } : item)))} placeholder="key" className="rounded border px-2 py-1 text-sm" />
            <div className="space-y-1">
              <input aria-label="Label" value={row.label} onChange={(event) => setRubric((rows) => rows.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))} placeholder="Label" className="w-full rounded border px-2 py-1 text-sm" />
              <input aria-label="Description" value={row.description} onChange={(event) => setRubric((rows) => rows.map((item, i) => (i === index ? { ...item, description: event.target.value } : item)))} placeholder="What earns full marks" className="w-full rounded border px-2 py-1 text-xs" />
            </div>
            <input aria-label="Max points" type="number" min={1} max={20} value={row.maxPoints} onChange={(event) => setRubric((rows) => rows.map((item, i) => (i === index ? { ...item, maxPoints: event.target.value } : item)))} className="rounded border px-2 py-1 text-sm" />
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setRubric((rows) => rows.filter((_, i) => i !== index))}>Remove</button>
          </div>
        ))}
        {rubric.length < 10 ? (
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setRubric((rows) => [...rows, { key: `criterion-${rows.length + 1}`, label: "", description: "", maxPoints: "5" }])}>
            Add criterion
          </button>
        ) : null}
      </fieldset>

      {error ? <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p> : null}
      <button type="submit" disabled={pending} className="rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Saving…" : "Save new version"}
      </button>
    </form>
  );
}
