"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  approveReviewCloseOut,
  bulkReviewApplications,
  cancelReviewCloseOut,
  decideReviewApplication,
  proposeReviewCloseOut,
  runReviewAnalysis,
} from "@/app/actions/review-queue-actions";
import { assignPracticalTask, inviteToWalkthrough, sendBasicAssessment } from "@/app/actions/screening-actions";
import { REVIEW_REJECT_REASONS, moveSelection, reviewKey } from "@/lib/review/review-queue";
import type { ScreeningRow } from "@/lib/screening/screening-data";
import { CATEGORY_LABELS, SCREENING_VIEWS, type ComponentKey, type PoolSummary, type ScreeningView } from "@/lib/screening/prioritization";

const CLOSE_OUT_VIEW: Partial<Record<ScreeningView, "WEAK_EVIDENCE" | "NOT_MET" | "POSSIBLE_FIT">> = {
  weak: "WEAK_EVIDENCE",
  not_met: "NOT_MET",
  possible: "POSSIBLE_FIT",
};

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
  resume: { id: number; fileName: string } | null;
  requirements: Array<{ key: string; result: string; quote: string | null }>;
  screeningAnswers: Array<{ question: string; answer: string }>;
  interviewFeedback: Array<{ interviewer: string; overallScore: number | null }>;
  decisions: Array<{ id: number; rationale: string; at: string; by: string }>;
};

type ReviewQueueProps = {
  jobId: number;
  jobTitle: string;
  rows: ScreeningRow[];
  summary: PoolSummary;
  detail: Detail | null;
  page: number;
  pageCount: number;
  total: number;
  view: ScreeningView;
  query: string;
  truncated: boolean;
  evidenceSource: "APPROVED_REQUIREMENTS" | "MATCHER_V1";
  hasPublishedAssessment: boolean;
  hasPractical: boolean;
};

const COMPONENT_LABEL: Record<ComponentKey, string> = { basic: "Basic", practical: "Practical", evidence: "Evidence" };

const STATUS_LABEL: Record<string, string> = {
  NOT_INVITED: "Not sent",
  INVITED: "Sent, not started",
  IN_PROGRESS: "In progress",
  EXPIRED: "Expired",
  PENDING_GRADING: "Needs grading",
  COMPLETED: "Completed",
  NOT_ASSIGNED: "Not assigned",
  ASSIGNED: "Assigned",
  OVERDUE: "Overdue",
  GRADED: "Graded",
  NOT_ANALYSED: "Not analysed",
  OPTED_OUT: "Opted out",
  NO_REQUIREMENTS: "No requirements",
  APPROVED_REQUIREMENTS: "Approved requirements",
  MATCHER_V1: "Resume matcher",
};

const STANDARD_STYLE: Record<string, string> = {
  MEETS: "bg-emerald-100 text-emerald-900",
  BORDERLINE: "bg-amber-100 text-amber-900",
  BELOW: "bg-zinc-200 text-zinc-800",
  INCOMPLETE: "bg-sky-100 text-sky-900",
  NO_THRESHOLD: "bg-zinc-100 text-zinc-700",
};

const STANDARD_LABEL: Record<string, string> = {
  MEETS: "Meets standard",
  BORDERLINE: "Borderline",
  BELOW: "Below standard",
  INCOMPLETE: "Incomplete",
  NO_THRESHOLD: "No threshold set",
};

function pct(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}`;
}

function componentCell(row: ScreeningRow, key: ComponentKey) {
  const component = row.evaluation.components[key];
  if (component.percent !== null) return `${pct(component.percent)}${component.comparable ? "" : " *"}`;
  return STATUS_LABEL[component.status] ?? component.status;
}

function combinedCell(row: ScreeningRow) {
  if (row.evaluation.combined !== null) return pct(row.evaluation.combined);
  if (row.evaluation.missing.length === 0) return "—";
  return `Missing ${row.evaluation.missing.map((key) => COMPONENT_LABEL[key].toLowerCase()).join(", ")}`;
}

export default function ReviewQueue(props: ReviewQueueProps) {
  const { jobId, jobTitle, rows, summary, detail, page, pageCount, total, view, query } = props;
  const router = useRouter();
  const [index, setIndex] = useState(() => Math.max(0, rows.findIndex((row) => row.applicationId === detail?.id)));
  const [selected, setSelected] = useState<number[]>([]);
  const [help, setHelp] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string>(REVIEW_REJECT_REASONS[0]);
  const [note, setNote] = useState("");
  const [humanReviewAcknowledged, setHumanReviewAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [closeOut, setCloseOut] = useState<{ id: number; count: number; skippedHumanReview: number; skippedClosed: number } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const current = rows[index] ?? null;
  const currentId = current?.applicationId ?? null;
  const [ackedFor, setAckedFor] = useState<number | null>(currentId);
  if (currentId !== ackedFor) {
    // Selection changed: the earlier acknowledgement must not silently apply to another candidate.
    setAckedFor(currentId);
    setHumanReviewAcknowledged(false);
  }
  const detailRow = rows.find((row) => row.applicationId === detail?.id) ?? null;

  function href(changes: Record<string, string | null>) {
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return `/dashboard/jobs/${jobId}/review?${params.toString()}`;
  }

  function select(rowIndex: number) {
    setIndex(rowIndex);
    const id = rows[rowIndex]?.applicationId;
    if (id) router.push(href({ selected: String(id) }), { scroll: false });
  }

  async function decide(action: "advance" | "shortlist" | "reject" | "undo", applicationId = current?.applicationId) {
    if (!applicationId || pending) return;
    if (action === "reject" && !rejecting) {
      setRejecting(true);
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await decideReviewApplication({
        jobId,
        applicationId,
        action,
        reason: action === "reject" ? reason : null,
        note: note.trim() || null,
        humanReviewAcknowledged: humanReviewAcknowledged || undefined,
      });
      setUndo(action === "undo" ? null : { id: applicationId });
      setRejecting(false);
      setNote("");
      setHumanReviewAcknowledged(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action was not applied.");
    } finally {
      setPending(false);
    }
  }

  async function proposeCloseOutFor(scope: "selected" | "view") {
    const category = CLOSE_OUT_VIEW[view];
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await proposeReviewCloseOut(
      scope === "selected" ? { jobId, reason, applicationIds: selected } : { jobId, reason, category },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRejecting(false);
    setConfirmText("");
    setCloseOut(result);
  }

  async function finishCloseOut(approve: boolean) {
    if (!closeOut) return;
    setPending(true);
    setError(null);
    if (approve) {
      const result = await approveReviewCloseOut({ jobId, batchId: closeOut.id, confirmCount: Number(confirmText) });
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`${result.closed.length} closed with reason “${reason}”. ${result.skipped.length} skipped. ${result.notificationsAttempted} candidate email(s) attempted.`);
    } else {
      const result = await cancelReviewCloseOut({ jobId, batchId: closeOut.id });
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("Close-out cancelled. Nothing changed.");
    }
    setCloseOut(null);
    setSelected([]);
    router.refresh();
  }

  async function bulk(action: "advance" | "shortlist") {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await bulkReviewApplications({ jobId, applicationIds: selected, action });
      const parts = [`${result.updated.length} updated.`];
      if (result.failed.length > 0) parts.push(`${result.failed.length} could not move from their current stage.`);
      setNotice(parts.join(" "));
      setSelected([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The bulk action was not applied.");
    } finally {
      setPending(false);
    }
  }

  async function stageAction(kind: "assessment" | "practical", applicationId: number, again = false) {
    if (again && !window.confirm(kind === "assessment" ? "Send a retake? The previous submission stays on record." : "Assign a new practical? The previous submission stays on record.")) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const result =
      kind === "assessment"
        ? await sendBasicAssessment({ jobId, applicationId, retake: again })
        : await assignPracticalTask({ jobId, applicationId, reassign: again });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(`${result.message} Link: ${result.url}`);
    router.refresh();
  }

  async function walkthrough(applicationId: number, resend = false) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await inviteToWalkthrough({ jobId, applicationId, resend });
    setPending(false);
    if (!result.ok) {
      if ("canResend" in result && window.confirm(`${result.error}\n\nSend a fresh link? The old link will stop working.`)) {
        await walkthrough(applicationId, true);
        return;
      }
      setError(result.error);
      return;
    }
    setNotice(`${result.message} Link: ${result.url}`);
  }

  const compareRows = rows.filter((row) => selected.includes(row.applicationId)).slice(0, 3);

  return (
    <div
      className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.9fr)]"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
        const command = reviewKey(event.key);
        if (!command) return;
        event.preventDefault();
        if (command === "next" || command === "previous") select(moveSelection(index, rows.length, command));
        else if (command === "help") setHelp((open) => !open);
        else if (command === "open" && detail?.resume) window.open(`/api/resumes/${detail.resume.id}`, "_blank");
        else if (command === "undo" && undo) void decide("undo", undo.id);
        else if (command === "advance" || command === "shortlist" || command === "reject") void decide(command);
      }}
    >
      <section className="min-w-0 rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-black">{jobTitle}</h1>
            <p className="text-sm text-zinc-500">
              {total} in this view · policy {summary.policyVersion ? `v${summary.policyVersion}` : "defaults (not saved)"} ·{" "}
              <Link className="underline" href={`/dashboard/jobs/${jobId}/screening`}>Screening setup</Link> ·{" "}
              <Link className="underline" href={`/dashboard/jobs/${jobId}/assessment`}>Assessment</Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border px-3 py-1 text-sm" disabled={compareRows.length < 2} onClick={() => setComparing((open) => !open)}>
              Compare ({compareRows.length})
            </button>
            <button type="button" className="rounded-lg border px-3 py-1 text-sm" disabled={pending || selected.length === 0} onClick={() => void bulk("advance")}>Advance</button>
            <button type="button" className="rounded-lg border px-3 py-1 text-sm" disabled={pending || selected.length === 0} onClick={() => void bulk("shortlist")}>Shortlist</button>
            <button type="button" className="rounded-lg border px-3 py-1 text-sm" disabled={pending || selected.length === 0} onClick={() => setRejecting(true)}>Reject…</button>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 border-b border-zinc-100 px-3 py-2 text-sm" aria-label="Screening views">
          {SCREENING_VIEWS.map((option) => (
            <Link
              key={option.key}
              href={href({ view: option.key, page: null, selected: null })}
              aria-current={view === option.key ? "page" : undefined}
              className={`rounded-full px-3 py-1 ${view === option.key ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"}`}
            >
              {option.label} <span className="opacity-70">{summary.viewCounts[option.key]}</span>
            </Link>
          ))}
        </nav>

        {summary.capacityNote ? <p className="border-b border-zinc-100 bg-sky-50 px-4 py-2 text-sm text-sky-900">{summary.capacityNote}</p> : null}
        {props.truncated ? <p className="border-b border-zinc-100 bg-amber-50 px-4 py-2 text-sm text-amber-900">This job has more applicants than the screening view loads at once. The oldest 5,000 are shown.</p> : null}
        {props.evidenceSource === "MATCHER_V1" ? (
          <p className="border-b border-zinc-100 px-4 py-2 text-xs text-zinc-500">
            Evidence comes from the resume matcher, not recruiter-approved requirements. A missing match is not proof of a missing skill.
          </p>
        ) : null}
        {error ? <p className="bg-red-50 px-4 py-2 text-sm text-red-800" role="alert">{error}</p> : null}
        {notice ? <p className="break-all bg-emerald-50 px-4 py-2 text-sm text-emerald-900" role="status">{notice}</p> : null}
        {help ? <p className="bg-zinc-50 px-4 py-2 text-sm text-zinc-700">J/K move, A advance, S shortlist, R reject, O open resume, U undo, ? help.</p> : null}
        {rejecting ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3 text-sm">
            <label>
              Rejection reason
              <select className="ml-2 rounded border px-2 py-1" value={reason} onChange={(event) => setReason(event.target.value)}>
                {REVIEW_REJECT_REASONS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            {selected.length > 0 ? (
              <button type="button" className="rounded bg-zinc-900 px-3 py-1 text-white" disabled={pending} onClick={() => void proposeCloseOutFor("selected")}>Propose close-out for {selected.length} selected</button>
            ) : (
              <button type="button" className="rounded bg-zinc-900 px-3 py-1 text-white" disabled={pending || !current} onClick={() => void decide("reject")}>Reject {current?.name ?? ""}</button>
            )}
            {CLOSE_OUT_VIEW[view] ? (
              <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void proposeCloseOutFor("view")}>
                Propose close-out of everyone in {SCREENING_VIEWS.find((option) => option.key === view)?.label} ({summary.viewCounts[view]})
              </button>
            ) : null}
            <button type="button" className="rounded border px-3 py-1" onClick={() => setRejecting(false)}>Cancel</button>
            <span className="text-xs text-zinc-500">Nothing is rejected automatically. A close-out changes nothing until it is approved. Candidates who asked for human review are left out.</span>
          </div>
        ) : null}

        {closeOut ? (
          <div className="space-y-2 border-b border-zinc-100 bg-amber-50 px-4 py-3 text-sm" role="region" aria-label="Approve close-out">
            <p className="font-semibold">Close-out #{closeOut.id} proposed: {closeOut.count} candidate(s), reason “{reason}”.</p>
            <p className="text-xs text-zinc-700">
              {closeOut.skippedHumanReview} left out because they asked for human review; {closeOut.skippedClosed} already closed. Approving rejects each listed
              candidate through the normal decision path and emails them, unless they unsubscribed.
            </p>
            <label className="block">
              Type {closeOut.count} to approve
              <input className="ml-2 w-24 rounded border px-2 py-1" inputMode="numeric" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
            </label>
            <div className="flex gap-2">
              <button type="button" className="rounded bg-zinc-900 px-3 py-1 text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={pending || confirmText !== String(closeOut.count)} onClick={() => void finishCloseOut(true)}>
                Approve close-out
              </button>
              <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void finishCloseOut(false)}>Cancel proposal</button>
            </div>
          </div>
        ) : null}

        {comparing && compareRows.length >= 2 ? (
          <div className="overflow-x-auto border-b border-zinc-100 px-4 py-3">
            <table className="w-full text-sm">
              <caption className="mb-2 text-left font-semibold">Side-by-side</caption>
              <thead>
                <tr>
                  <th className="text-left font-medium text-zinc-500" scope="col">Measure</th>
                  {compareRows.map((row) => <th key={row.applicationId} className="text-left" scope="col">{row.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {(["basic", "practical", "evidence"] as const).map((key) => (
                  <tr key={key}>
                    <th scope="row" className="py-1 text-left font-medium text-zinc-500">{COMPONENT_LABEL[key]}</th>
                    {compareRows.map((row) => <td key={row.applicationId}>{componentCell(row, key)}</td>)}
                  </tr>
                ))}
                <tr><th scope="row" className="py-1 text-left font-medium text-zinc-500">Combined</th>{compareRows.map((row) => <td key={row.applicationId}>{combinedCell(row)}</td>)}</tr>
                <tr><th scope="row" className="py-1 text-left font-medium text-zinc-500">Standard</th>{compareRows.map((row) => <td key={row.applicationId}>{STANDARD_LABEL[row.evaluation.standard]}</td>)}</tr>
                <tr><th scope="row" className="py-1 text-left font-medium text-zinc-500">Confidence</th>{compareRows.map((row) => <td key={row.applicationId}>{row.evaluation.confidence.toLowerCase()}</td>)}</tr>
                <tr>
                  <th scope="row" className="py-1 align-top text-left font-medium text-zinc-500">Flags</th>
                  {compareRows.map((row) => (
                    <td key={row.applicationId} className="align-top text-xs">{row.evaluation.flags.map((flag) => flag.message).join(" ") || "None"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2" scope="col"><span className="sr-only">Select</span></th>
                <th className="px-2 py-2" scope="col">Rank</th>
                <th className="px-2 py-2" scope="col">Candidate</th>
                <th className="px-2 py-2" scope="col">Basic</th>
                <th className="px-2 py-2" scope="col">Practical</th>
                <th className="px-2 py-2" scope="col">Evidence</th>
                <th className="px-2 py-2" scope="col">Combined</th>
                <th className="px-2 py-2" scope="col">Standard / category</th>
                <th className="px-2 py-2" scope="col">Next action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={row.applicationId}
                  className={`border-b border-zinc-100 align-top ${rowIndex === index ? "bg-amber-50" : ""} ${row.closed ? "text-zinc-400" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name}`}
                      checked={selected.includes(row.applicationId)}
                      onChange={(event) =>
                        setSelected((ids) => (event.target.checked ? [...ids, row.applicationId] : ids.filter((id) => id !== row.applicationId)))
                      }
                    />
                  </td>
                  <td className="px-2 py-2 tabular-nums">{row.evaluation.rank ?? "—"}{row.evaluation.priority ? <span className="ml-1 text-xs text-emerald-700" title="In Top applicants">●</span> : null}</td>
                  <td className="px-2 py-2">
                    <button type="button" className="text-left" onClick={() => select(rowIndex)}>
                      <span className="font-semibold text-black">{row.name}</span>
                      <span className="block text-xs text-zinc-500">{row.status.replace(/_/g, " ").toLowerCase()}{row.title ? ` · ${row.title}` : ""}</span>
                      {row.evaluation.flags.length > 0 ? (
                        <span className="mt-0.5 block text-xs text-amber-800">{row.evaluation.flags.length} flag{row.evaluation.flags.length === 1 ? "" : "s"}</span>
                      ) : null}
                    </button>
                  </td>
                  <td className="px-2 py-2 tabular-nums">{componentCell(row, "basic")}</td>
                  <td className="px-2 py-2 tabular-nums">{componentCell(row, "practical")}</td>
                  <td className="px-2 py-2 tabular-nums">{componentCell(row, "evidence")}</td>
                  <td className="px-2 py-2 tabular-nums">{combinedCell(row)}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STANDARD_STYLE[row.evaluation.standard]}`}>{STANDARD_LABEL[row.evaluation.standard]}</span>
                    <span className="mt-1 block text-xs text-zinc-600">{CATEGORY_LABELS[row.evaluation.category]}</span>
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-700">{row.evaluation.nextAction}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-zinc-500">No candidates in this view.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 text-sm text-zinc-500">
          <span>Page {page} of {pageCount} · * different version than most applicants, not ranked against them</span>
          <span className="flex gap-3">
            {page > 1 ? <Link className="underline" href={href({ page: String(page - 1), selected: null })}>Previous</Link> : null}
            {page < pageCount ? <Link className="underline" href={href({ page: String(page + 1), selected: null })}>Next</Link> : null}
          </span>
        </div>
      </section>

      <aside className="rounded-xl border border-zinc-200 bg-white p-4">
        {detail && detailRow ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold">{detail.name}</h2>
              <p className="text-sm text-zinc-600">{detail.title}{detail.company ? ` at ${detail.company}` : ""}</p>
              <p className="mt-1 text-sm">Stage {detail.status.replace(/_/g, " ").toLowerCase()}{detail.humanReview ? " · Human review requested" : ""}</p>
            </div>

            <section>
              <h3 className="font-semibold">Screening result</h3>
              <dl className="mt-2 space-y-1 text-sm">
                {(["basic", "practical", "evidence"] as const).map((key) => {
                  const component = detailRow.evaluation.components[key];
                  return (
                    <div key={key} className="flex justify-between gap-3">
                      <dt className="text-zinc-600">
                        {COMPONENT_LABEL[key]} <span className="text-xs">({component.weight}%{component.threshold !== null ? `, pass ${component.threshold}` : ""})</span>
                      </dt>
                      <dd className="text-right tabular-nums">
                        {component.percent !== null ? `${pct(component.percent)}%` : STATUS_LABEL[component.status] ?? component.status}
                        {component.percent !== null && !component.comparable ? " (different version)" : ""}
                      </dd>
                    </div>
                  );
                })}
                <div className="flex justify-between gap-3 border-t border-zinc-100 pt-1 font-medium">
                  <dt>Combined</dt>
                  <dd className="tabular-nums">{combinedCell(detailRow)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-zinc-500">
                Combined = weighted average of the components above, shown only when all weighted components are complete and comparable.
                Missing results are never counted as zero. Eligibility: {detailRow.evaluation.eligibility.toLowerCase().replace("_", " ")}
                {detailRow.requirementsApproved ? "" : " (knockout questions only; no essential requirements approved)"}. Confidence:{" "}
                {detailRow.evaluation.confidence.toLowerCase()}.
              </p>
              {detailRow.evaluation.flags.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-amber-900">
                  {detailRow.evaluation.flags.map((flag) => <li key={flag.code + flag.message}>• {flag.message}</li>)}
                </ul>
              ) : null}
              <p className="mt-2 rounded bg-zinc-50 px-3 py-2 text-sm"><span className="font-medium">Next:</span> {detailRow.evaluation.nextAction}</p>
            </section>

            {!detailRow.closed ? (
              <section className="flex flex-wrap gap-2 text-sm">
                {props.hasPublishedAssessment ? (
                  detailRow.evaluation.components.basic.status === "NOT_INVITED" || detailRow.evaluation.components.basic.status === "EXPIRED" ? (
                    <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void stageAction("assessment", detail.id)}>Send basic assessment</button>
                  ) : detailRow.evaluation.components.basic.status === "INVITED" || detailRow.evaluation.components.basic.status === "IN_PROGRESS" ? (
                    <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void stageAction("assessment", detail.id)}>Resend assessment link</button>
                  ) : (
                    <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void stageAction("assessment", detail.id, true)}>Send retake</button>
                  )
                ) : (
                  <Link className="rounded border px-3 py-1" href={`/dashboard/jobs/${jobId}/assessment`}>Publish a basic assessment</Link>
                )}
                {props.hasPractical ? (
                  detailRow.practicalId === null || detailRow.evaluation.components.practical.status === "OVERDUE" ? (
                    <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void stageAction("practical", detail.id, detailRow.practicalId !== null && detailRow.evaluation.components.practical.status !== "OVERDUE")}>
                      Assign practical
                    </button>
                  ) : detailRow.evaluation.components.practical.status === "ASSIGNED" ? (
                    <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void stageAction("practical", detail.id)}>Resend practical link</button>
                  ) : null
                ) : (
                  <Link className="rounded border px-3 py-1" href={`/dashboard/jobs/${jobId}/screening`}>Set up a practical</Link>
                )}
                {detailRow.evaluation.components.practical.status === "GRADED" || detailRow.evaluation.components.practical.status === "PENDING_GRADING" ? (
                  <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void walkthrough(detail.id)}>
                    Invite to 10-min walkthrough
                  </button>
                ) : null}
                <Link className="rounded bg-zinc-900 px-3 py-1 text-white" href={`/dashboard/jobs/${jobId}/evaluation/${detail.id}`}>Open evaluation</Link>
              </section>
            ) : (
              <Link className="text-sm underline" href={`/dashboard/jobs/${jobId}/evaluation/${detail.id}`}>Open evaluation</Link>
            )}

            {!detailRow.closed ? (
              <section className="space-y-2">
                <h3 className="font-semibold">Decision</h3>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="Optional note for the decision history"
                  className="w-full rounded border px-2 py-1 text-sm"
                  aria-label="Decision note"
                />
                {detail.humanReview ? (
                  <label className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={humanReviewAcknowledged}
                      onChange={(event) => setHumanReviewAcknowledged(event.target.checked)}
                      aria-label="Acknowledge the candidate's human-review request"
                    />
                    <span>
                      This candidate asked a human to review their application. I have reviewed it myself and am
                      making this decision deliberately. The request stays recorded either way.
                    </span>
                  </label>
                ) : null}
                <div className="flex flex-wrap gap-2 text-sm">
                  <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void decide("advance", detail.id)}>Advance</button>
                  <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void decide("shortlist", detail.id)}>Shortlist</button>
                  <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => { setIndex(Math.max(0, rows.findIndex((row) => row.applicationId === detail.id))); setRejecting(true); }}>Reject…</button>
                  {undo?.id === detail.id ? <button type="button" className="rounded border px-3 py-1" disabled={pending} onClick={() => void decide("undo", detail.id)}>Undo last change</button> : null}
                </div>
              </section>
            ) : null}

            <section>
              <h3 className="font-semibold">Decision history</h3>
              {detail.decisions.length > 0 ? (
                <ul className="mt-2 space-y-2 text-xs text-zinc-700">
                  {detail.decisions.map((decision) => (
                    <li key={decision.id}>
                      <span className="font-medium">{new Date(decision.at).toLocaleString()} · {decision.by}</span>
                      <span className="block break-words">{decision.rationale}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-sm text-zinc-500">No decisions recorded yet.</p>}
            </section>

            <section>
              <h3 className="font-semibold">Resume evidence</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {detail.requirements.map((item) => (
                  <li key={item.key}>{item.result.toLowerCase()}: {item.key}{item.quote ? ` — “${item.quote}”` : ""}</li>
                ))}
                {detail.requirements.length === 0 ? <li className="text-zinc-500">{detail.optedOut ? "Candidate opted out of automated matching. Review the resume manually." : "No requirement matches yet."}</li> : null}
              </ul>
              {!detail.optedOut && detailRow.evaluation.components.evidence.status === "NOT_ANALYSED" ? (
                <button type="button" className="mt-2 rounded border px-2 py-1 text-xs" onClick={() => void runReviewAnalysis({ jobId, applicationId: detail.id }).then(() => router.refresh())}>
                  Run analysis
                </button>
              ) : null}
            </section>

            <section>
              <h3 className="font-semibold">Interview scores</h3>
              {detail.interviewFeedback.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {detail.interviewFeedback.map((card) => <li key={card.interviewer}>{card.interviewer}: {card.overallScore ?? "—"} / 5</li>)}
                </ul>
              ) : <p className="text-sm text-zinc-500">No submitted scorecards yet.</p>}
            </section>

            <section>
              <h3 className="font-semibold">Screening answers</h3>
              {detail.screeningAnswers.length > 0 ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {detail.screeningAnswers.map((item) => <li key={item.question}>{item.question}: {item.answer}</li>)}
                </ul>
              ) : <p className="text-sm text-zinc-500">No screening answers were stored for this application.</p>}
            </section>

            {detail.resume ? (
              <p className="text-sm">
                <a className="font-semibold underline" href={`/api/resumes/${detail.resume.id}`} target="_blank" rel="noreferrer">{detail.resume.fileName}</a>
              </p>
            ) : <p className="text-sm text-zinc-500">No resume file.</p>}
          </div>
        ) : <p className="text-sm text-zinc-500">Select an applicant.</p>}
      </aside>
    </div>
  );
}
