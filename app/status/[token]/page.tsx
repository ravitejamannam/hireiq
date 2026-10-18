import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Application status",
};

import { SelfIdForm } from "@/components/fairness/SelfIdForm";
import { getPublicStatus } from "@/lib/candidates/public-status-service";
import {
  optOutOfAiEvaluation,
  requestHumanReview,
} from "@/app/actions/candidate-portal-actions";

export const dynamic = "force-dynamic";

const STAGE_ORDER = [
  { key: "CV_POOL", label: "Applied" },
  { key: "EXPERT_REVIEW", label: "Under review" },
  { key: "TECH_EVALUATION", label: "Technical evaluation" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "SELECTED", label: "Selected" },
  { key: "HIRED", label: "Hired 🎉" },
];

type PageProps = {
  params: Promise<{ token: string }>;
};

function StageBar({ current, rejected }: { current: string; rejected: boolean }) {
  const idx = STAGE_ORDER.findIndex((s) => s.key === current);
  return (
    <div className="mt-6 space-y-0">
      {STAGE_ORDER.map((stage, i) => {
        const reached = !rejected && i <= (idx >= 0 ? idx : -1);
        const isCurrent = !rejected && i === idx;
        return (
          <div key={stage.key} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  isCurrent
                    ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                    : reached
                      ? "bg-emerald-500 text-white"
                      : "bg-zinc-200 text-zinc-400"
                }`}
              >
                {reached && !isCurrent ? "✓" : i + 1}
              </span>
              {i < STAGE_ORDER.length - 1 ? (
                <span
                  className={`h-8 w-0.5 ${i < idx ? "bg-emerald-300" : "bg-zinc-200"}`}
                />
              ) : null}
            </div>
            <p
              className={`pt-1 text-sm ${
                isCurrent ? "font-semibold text-indigo-700" : reached ? "text-zinc-600" : "text-zinc-400"
              }`}
            >
              {stage.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default async function StatusPage({ params }: PageProps) {
  const { token } = await params;
  const status = await getPublicStatus(token);

  if (!status) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-6">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-zinc-900">Not found</h1>
          <p className="mt-2 text-zinc-600">
            This tracking link is invalid or the application no longer exists.
          </p>
        </div>
      </main>
    );
  }

  const rejected = status.currentStage.toLowerCase().includes("not progressing");

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-indigo-600">{status.companyName}</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">{status.jobTitle}</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Applied {new Date(status.appliedAt).toLocaleDateString()}
          </p>

          <div className="mt-5 rounded-xl bg-zinc-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Current stage
            </p>
            <p className="mt-1 text-xl font-bold text-indigo-700">{status.currentStage}</p>
          </div>

          <p className="mt-4 text-sm text-zinc-800">
            <a className="font-semibold underline" href="/portal">
              Open the candidate portal
            </a>{" "}
            to see every application, upload documents, and manage interviews. Scores are not shown to you.
          </p>

          <section className="mt-6" aria-labelledby="ai-notice-heading">
            <h2 id="ai-notice-heading" className="text-sm font-semibold text-zinc-900">
              AI notice
            </h2>
            <p className="mt-2 text-sm text-zinc-700">
              {status.notice ??
                "HireIQ may draft notes for recruiters. A person approves anything you would see. Opting out stops AI evaluation of this application."}
            </p>
            <form action={optOutOfAiEvaluation.bind(null, token)} className="mt-3">
              <button
                type="submit"
                disabled={status.optedOut}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
              >
                {status.optedOut ? "Opted out of AI evaluation" : "Opt out of AI evaluation"}
              </button>
            </form>
            <form action={requestHumanReview.bind(null, token)} className="mt-2">
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-900"
              >
                {status.humanReviewRequested ? "Human review requested" : "Request a human review"}
              </button>
            </form>
          </section>
          <SelfIdForm action={`/status/${token}/self-id`} saved={false} />

          {status.interviews.length > 0 ? (
            <section className="mt-6" aria-labelledby="interviews-heading">
              <h2 id="interviews-heading" className="text-sm font-semibold text-zinc-900">
                Interviews
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                {status.interviews.map((interview) => (
                  <li key={interview.at.toISOString()}>
                    {interview.type} · {interview.at.toLocaleString()}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-4">
            <StageBar current={rejected ? "" : ""} rejected={false} />
          </div>
        </header>

        <footer className="text-center text-xs text-zinc-400">
          <p>🔒 Your data is protected. This link is personal — do not share it.</p>
        </footer>
      </div>
    </main>
  );
}
