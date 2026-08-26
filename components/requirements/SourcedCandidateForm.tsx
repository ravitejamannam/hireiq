"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addSourcedCandidateAction as addSourcedCandidate } from "@/app/actions/sourced-candidate-actions";

/**
 * T129: quick-add form for outbound-sourced candidates.
 */

export default function SourcedCandidateForm({ jobId }: { jobId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [skills, setSkills] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [location, setLocation] = useState("");
  const [currentEmployer, setCurrentEmployer] = useState("");
  const [source, setSource] = useState<"LINKEDIN" | "NAUKRI">("LINKEDIN");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await addSourcedCandidate({
        jobId,
        name,
        skills: skills || undefined,
        experienceYears: experienceYears ? Number(experienceYears) : undefined,
        location: location || undefined,
        currentEmployer: currentEmployer || undefined,
        source,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(
        res.reusedCandidate
          ? `✓ ${name} already existed — added to this pipeline.`
          : `✓ ${name} added to the pipeline.`,
      );
      setName("");
      setSkills("");
      setExperienceYears("");
      setLocation("");
      setCurrentEmployer("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
      >
        + Add sourced candidate
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-black">Add sourced candidate</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          Close
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-zinc-500">
          Full name *
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priya Sharma"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="text-xs font-medium text-zinc-500">
          Skills (comma-separated)
          <input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="React, TypeScript"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="text-xs font-medium text-zinc-500">
          Experience (years)
          <input
            type="number"
            min={0}
            value={experienceYears}
            onChange={(e) => setExperienceYears(e.target.value)}
            placeholder="4"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="text-xs font-medium text-zinc-500">
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Bengaluru"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="text-xs font-medium text-zinc-500">
          Current employer
          <input
            value={currentEmployer}
            onChange={(e) => setCurrentEmployer(e.target.value)}
            placeholder="Swiggy"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="text-xs font-medium text-zinc-500">
          Sourced from
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as "LINKEDIN" | "NAUKRI")}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="LINKEDIN">LinkedIn</option>
            <option value="NAUKRI">Naukri</option>
          </select>
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-emerald-700">{notice}</p> : null}

      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending || name.trim().length < 2}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add to pipeline"}
      </button>
    </div>
  );
}
