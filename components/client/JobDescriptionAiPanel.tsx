"use client";

import { useState } from "react";
import type { JobDescriptionAiGenerationStatus } from "@prisma/client";

import {
  acceptGeneratedJobDescription,
  discardGeneratedJobDescription,
  generateJobDescription,
  regenerateJobDescriptionSection,
} from "@/app/actions/job-actions";
import {
  JD_LENGTHS,
  JD_SECTIONS,
  JD_TONES,
  diffWords,
  parseStoredProposal,
  type JdControls,
  type JdLength,
  type JdSection,
  type JdTone,
} from "@/lib/ai/job-description-document";
const toneLabels: Record<JdTone, string> = {
  startup: "Startup",
  corporate: "Corporate",
  friendly: "Friendly",
};
const lengthLabels: Record<JdLength, string> = {
  short: "Short (~100 words)",
  standard: "Standard (~160 words)",
  detailed: "Detailed (~200 words)",
};

type JobDescriptionAiPanelProps = {
  jobId: number;
  currentJobDescription: string | null;
  aiProposedJobDescription: string | null;
  aiGenerationStatus: JobDescriptionAiGenerationStatus | null;
};

export default function JobDescriptionAiPanel({
  jobId,
  currentJobDescription,
  aiProposedJobDescription,
  aiGenerationStatus,
}: JobDescriptionAiPanelProps) {
  const [status, setStatus] = useState(aiGenerationStatus);
  const [proposalRaw, setProposalRaw] = useState(aiProposedJobDescription);
  const [error, setError] = useState<string | null>(null);
  const [tone, setTone] = useState<JdTone>("corporate");
  const [length, setLength] = useState<JdLength>("standard");
  const [ctcInLpa, setCtcInLpa] = useState(false);
  const [noticePeriod, setNoticePeriod] = useState(false);
  const [cityOrHybrid, setCityOrHybrid] = useState(false);
  const [section, setSection] = useState<JdSection>("responsibilities");
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [biasConfirmed, setBiasConfirmed] = useState(false);

  const controls: JdControls = {
    tone,
    length,
    india: { ctcInLpa, noticePeriod, cityOrHybrid },
  };
  const proposal = parseStoredProposal(proposalRaw);
  const proposedText = proposal?.jobDescription ?? proposalRaw;
  const diff =
    status === "READY" && proposedText
      ? diffWords(currentJobDescription ?? "", proposedText)
      : null;

  async function generate() {
    setPending(true);
    setStatus("GENERATING");
    setError(null);
    try {
      const version = await generateJobDescription(jobId, controls);
      setProposalRaw(version.aiProposedJobDescription);
      setStatus(version.aiGenerationStatus);
    } catch (cause) {
      setStatus("FAILED");
      setError(cause instanceof Error ? cause.message : "Generation failed.");
    } finally {
      setPending(false);
    }
  }

  async function accept() {
    setPending(true);
    try {
      await acceptGeneratedJobDescription(jobId);
      setStatus("NONE");
      setProposalRaw(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not accept.");
    } finally {
      setPending(false);
    }
  }

  async function discard() {
    setPending(true);
    try {
      await discardGeneratedJobDescription(jobId);
      setStatus("NONE");
      setProposalRaw(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not discard.");
    } finally {
      setPending(false);
    }
  }

  async function rewriteSection() {
    setPending(true);
    setError(null);
    try {
      const next = await regenerateJobDescriptionSection(jobId, section, instruction, controls);
      setProposalRaw(JSON.stringify(next));
      setStatus("READY");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rewrite that section.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-black">Job description</h2>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={pending || status === "GENERATING"}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          Generate with AI
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <label>
          Tone{" "}
          <select
            aria-label="Tone"
            value={tone}
            onChange={(event) => setTone(event.target.value as JdTone)}
            className="rounded-lg border border-zinc-300 px-2 py-1"
          >
            {JD_TONES.map((value) => (
              <option key={value} value={value}>
                {toneLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Length{" "}
          <select
            aria-label="Length"
            value={length}
            onChange={(event) => setLength(event.target.value as JdLength)}
            className="rounded-lg border border-zinc-300 px-2 py-1"
          >
            {JD_LENGTHS.map((value) => (
              <option key={value} value={value}>
                {lengthLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={ctcInLpa} onChange={(event) => setCtcInLpa(event.target.checked)} />
          CTC in LPA
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={noticePeriod}
            onChange={(event) => setNoticePeriod(event.target.checked)}
          />
          Notice period
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={cityOrHybrid}
            onChange={(event) => setCityOrHybrid(event.target.checked)}
          />
          City or hybrid
        </label>
      </div>

      {status === "GENERATING" ? (
        <p className="mt-4 text-sm text-zinc-600" role="status">
          Generating…
        </p>
      ) : null}

      {status === "FAILED" ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>{error ?? "We couldn't generate the job description right now. Your requirement was not changed."}</p>
          <button type="button" onClick={() => void generate()} className="mt-2 font-semibold underline">
            Retry
          </button>
        </div>
      ) : null}

      {status === "READY" && proposedText ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-black">Current</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
              {currentJobDescription?.trim() || "No job description yet."}
            </p>
            {diff && diff.removed.length > 0 ? (
              <p className="mt-2 text-sm text-red-700 line-through">{diff.removed.join(" ")}</p>
            ) : null}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-black">Proposed</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{proposedText}</p>
            {diff && diff.added.length > 0 ? (
              <p className="mt-2 text-sm text-emerald-800">{diff.added.join(" ")}</p>
            ) : null}
          </div>
          {proposal ? (
            <div className="lg:col-span-2 space-y-2 text-sm text-zinc-700">
              {proposal.quality.missingInfo.length > 0 ? (
                <p>Missing info: {proposal.quality.missingInfo.join(", ")}</p>
              ) : null}
              {proposal.quality.biasFlags.length > 0 ? (
                <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
                  <p className="font-semibold">Biased wording is still in this draft.</p>
                  <ul className="mt-2 list-disc pl-5">
                    {proposal.quality.biasFlags.map((flag) => (
                      <li key={flag.phrase}>
                        “{flag.phrase}” — use “{flag.suggestion}” instead.
                      </li>
                    ))}
                  </ul>
                  {biasConfirmed ? (
                    <p className="mt-2 font-semibold">Accept again to keep this wording.</p>
                  ) : null}
                </div>
              ) : null}
              {proposal.quality.contradictions.map((note) => (
                <p key={note}>{note}</p>
              ))}
              <p>
                Readability {proposal.quality.readability.score} ({proposal.quality.readability.label})
                {proposal.quality.lengthWarning ? `. ${proposal.quality.lengthWarning}` : ""}
              </p>
              <p className="font-medium text-black">Board copies</p>
              <p>Naukri: {proposal.boards.naukri.slice(0, 180)}</p>
              <p>LinkedIn: {proposal.boards.linkedin.slice(0, 180)}</p>
              <p>Indeed: {proposal.boards.indeed.slice(0, 180)}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 lg:col-span-2">
            <div>
              <button
                type="button"
                onClick={() => {
                  if ((proposal?.quality.biasFlags.length ?? 0) > 0 && !biasConfirmed) {
                    setBiasConfirmed(true);
                    return;
                  }
                  void accept();
                }}
                disabled={pending}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {biasConfirmed ? "Accept anyway" : "Accept"}
              </button>
              <p className="mt-2 text-xs text-zinc-600">
                Publish to apply these to matching.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void discard()}
              disabled={pending}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold"
            >
              Discard
            </button>
          </div>
          {proposal ? (
            <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
              <label className="text-sm">
                Section{" "}
                <select
                  aria-label="Section"
                  value={section}
                  onChange={(event) => setSection(event.target.value as JdSection)}
                  className="rounded-lg border border-zinc-300 px-2 py-1"
                >
                  {JD_SECTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <input
                aria-label="Section instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="make responsibilities more senior"
                className="min-w-64 rounded-lg border border-zinc-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => void rewriteSection()}
                disabled={pending || !instruction.trim()}
                className="rounded-xl border border-zinc-300 px-3 py-1 text-sm font-semibold"
              >
                Rewrite section
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {error && status !== "FAILED" ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
