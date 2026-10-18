"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationPipelineStatus } from "@prisma/client";

import { bulkReviewApplications, decideReviewApplication, runReviewAnalysis } from "@/app/actions/review-queue-actions";
import {
  REVIEW_REJECT_REASONS,
  moveSelection,
  reviewKey,
  scoreLabel,
  type ReviewRow,
} from "@/lib/review/review-queue";

type Detail = {
  id: number;
  name: string;
  title: string | null;
  company: string | null;
  skills: string | null;
  location: string | null;
  status: string;
  optedOut: boolean;
  humanReview: boolean;
  resume: { id: number; fileName: string; extractedText: string | null } | null;
  requirements: Array<{ key: string; result: string; quote: string | null }>;
  screeningAnswers: Array<{ question: string; answer: string }>;
  interviewFeedback: Array<{ interviewer: string; overallScore: number | null }>;
  assessmentGrades: Array<{ requirement: string; score: number | null; needsHuman: boolean; quote: string | null }>;
};

type ReviewQueueProps = {
  jobId: number;
  jobTitle: string;
  rows: ReviewRow[];
  detail: Detail | null;
  page: number;
  pageCount: number;
  query: string;
};

export default function ReviewQueue({ jobId, jobTitle, rows, detail, page, pageCount, query }: ReviewQueueProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [help, setHelp] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string>(REVIEW_REJECT_REASONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: number; status: ApplicationPipelineStatus } | null>(null);
  const [pending, setPending] = useState(false);
  const current = rows[index] ?? null;
  const shown = useMemo(() => rows, [rows]);

  function pushFilters(next: URLSearchParams) {
    router.push(`/dashboard/jobs/${jobId}/review?${next.toString()}`);
  }

  async function run(action: "advance" | "shortlist" | "reject" | "undo", application = current) {
    if (!application || pending) return;
    if (action === "reject" && !rejecting) {
      setRejecting(true);
      return;
    }
    const previous = application.status;
    setPending(true);
    setError(null);
    try {
      await decideReviewApplication({
        jobId,
        applicationId: application.id,
        action,
        reason: action === "reject" ? reason : null,
        undoTo: action === "undo" ? undo?.status : null,
      });
      if (action === "undo") setUndo(null);
      else setUndo({ id: application.id, status: previous });
      setRejecting(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action was rolled back.");
    } finally {
      setPending(false);
    }
  }

  async function bulk(action: "advance" | "shortlist" | "reject") {
    setPending(true);
    setError(null);
    try {
      const result = await bulkReviewApplications({
        jobId,
        applicationIds: selected,
        rows: shown,
        action,
        reason: action === "reject" ? reason : null,
      });
      if (result.blocked.length > 0) {
        setError(`${result.blocked.length} candidate${result.blocked.length === 1 ? "" : "s"} asked for human review and were not rejected.`);
      }
      setSelected([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The bulk action was rolled back.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]"
      tabIndex={0}
      onKeyDown={(event) => {
        const command = reviewKey(event.key);
        if (!command) return;
        event.preventDefault();
        if (command === "next" || command === "previous") {
          const next = moveSelection(index, shown.length, command === "next" ? "next" : "previous");
          setIndex(next);
          const id = shown[next]?.id;
          if (id) {
            const params = new URLSearchParams(query);
            params.set("selected", String(id));
            pushFilters(params);
          }
        } else if (command === "help") setHelp((open) => !open);
        else if (command === "open" && detail?.resume) window.open(`/api/resumes/${detail.resume.id}`, "_blank");
        else if (command === "undo" && undo) void run("undo", shown.find((row) => row.id === undo.id) ?? current);
        else if (command === "advance") void run("advance");
        else if (command === "shortlist") void run("shortlist");
        else if (command === "reject") void run("reject");
      }}
    >
      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-black">{jobTitle}</h1>
            <p className="text-sm text-zinc-500">Review queue · {shown.length} on this page</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border px-3 py-1 text-sm" disabled={pending || selected.length === 0} onClick={() => void bulk("advance")}>Advance</button>
            <button type="button" className="rounded-lg border px-3 py-1 text-sm" disabled={pending || selected.length === 0} onClick={() => void bulk("shortlist")}>Shortlist</button>
            <button type="button" className="rounded-lg border px-3 py-1 text-sm" disabled={pending || selected.length === 0} onClick={() => void bulk("reject")}>Reject</button>
          </div>
        </div>
        {error ? <p className="bg-red-50 px-4 py-2 text-sm text-red-800" role="alert">{error}</p> : null}
        {help ? (
          <p className="bg-zinc-50 px-4 py-2 text-sm text-zinc-700">J/K move, A advance, S shortlist, R reject, O open resume, U undo, ? help.</p>
        ) : null}
        {rejecting ? (
          <label className="block border-b border-zinc-100 px-4 py-3 text-sm">
            Rejection reason
            <select className="ml-2 rounded border px-2 py-1" value={reason} onChange={(event) => setReason(event.target.value)}>
              {REVIEW_REJECT_REASONS.map((item) => <option key={item}>{item}</option>)}
            </select>
            <button type="button" className="ml-2 rounded bg-zinc-900 px-3 py-1 text-white" onClick={() => void run("reject")}>Confirm reject</button>
          </label>
        ) : null}
        <ul>
          {shown.map((row, rowIndex) => (
            <li key={row.id} className={`border-b border-zinc-100 px-4 py-3 ${rowIndex === index ? "bg-amber-50 outline outline-2 outline-amber-400" : ""}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.name}`}
                  checked={selected.includes(row.id)}
                  onChange={(event) => setSelected((currentIds) => event.target.checked ? [...currentIds, row.id] : currentIds.filter((id) => id !== row.id))}
                />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setIndex(rowIndex); const params = new URLSearchParams(query); params.set("selected", String(row.id)); pushFilters(params); }}>
                  <span className="font-semibold text-black">{row.name}</span>
                  <span className="ml-2 text-sm text-zinc-600">{row.title}{row.company ? ` · ${row.company}` : ""}</span>
                  <span className="ml-2 text-sm font-medium">{scoreLabel(row)}</span>
                  {row.humanReview ? <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs">Human review requested</span> : null}
                  {row.parseStatus ? <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs">{row.parseStatus}</span> : null}
                  <span className="ml-2 text-xs text-zinc-500">Knockout {row.knockout}</span>
                  <span className="mt-1 block text-sm text-zinc-600">{row.quotes.slice(0, 3).join(" · ") || "No evidence quotes yet"}</span>
                </button>
                {!row.analysed && !row.optedOut ? (
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => {
                      void runReviewAnalysis({ jobId, applicationId: row.id }).then(() => router.refresh());
                    }}
                  >
                    Run analysis
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <p className="px-4 py-3 text-sm text-zinc-500">Page {page} of {pageCount}</p>
      </section>
      <aside className="rounded-xl border border-zinc-200 bg-white p-4">
        {detail ? (
          <div>
            <h2 className="text-lg font-bold">{detail.name}</h2>
            <p className="text-sm text-zinc-600">{detail.title}{detail.company ? ` at ${detail.company}` : ""}</p>
            <p className="mt-2 text-sm">Stage {detail.status}{detail.humanReview ? " · Human review requested" : ""}</p>
            <p className="mt-2 text-sm">{detail.skills || "No skills listed"}</p>
            <h3 className="mt-4 font-semibold">Requirements</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {detail.requirements.map((item) => (
                <li key={item.key}>{item.result}: {item.key}{item.quote ? ` — “${item.quote}”` : ""}</li>
              ))}
              {detail.requirements.length === 0 ? <li>No requirement matches yet.</li> : null}
            </ul>
            <h3 className="mt-4 font-semibold">Assessment</h3>
            {detail.assessmentGrades.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {detail.assessmentGrades.map((grade) => (
                  <li key={grade.requirement}>
                    {grade.requirement}: {grade.needsHuman ? "Needs human grading" : grade.score}
                    {grade.quote ? ` — “${grade.quote}”` : ""}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-zinc-600">No assessment submitted.</p>}
            <h3 className="mt-4 font-semibold">Interview scores</h3>
            {detail.interviewFeedback.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {detail.interviewFeedback.map((card) => (
                  <li key={card.interviewer}>{card.interviewer}: {card.overallScore ?? "—"} / 5</li>
                ))}
              </ul>
            ) : <p className="text-sm text-zinc-600">No submitted scorecards yet.</p>}
            <h3 className="mt-4 font-semibold">Screening answers</h3>
            {detail.screeningAnswers.length > 0 ? (
              <ul className="mt-2 space-y-2 text-sm">
                {detail.screeningAnswers.map((item) => (
                  <li key={item.question}>{item.question}: {item.answer}</li>
                ))}
              </ul>
            ) : <p className="text-sm text-zinc-600">No screening answers were stored for this application.</p>}
            {detail.resume ? (
              <p className="mt-4 text-sm">
                <a className="font-semibold underline" href={`/api/resumes/${detail.resume.id}`} target="_blank" rel="noreferrer">{detail.resume.fileName}</a>
              </p>
            ) : <p className="mt-4 text-sm text-zinc-500">No resume file.</p>}
          </div>
        ) : <p className="text-sm text-zinc-500">Select an applicant.</p>}
      </aside>
    </div>
  );
}
