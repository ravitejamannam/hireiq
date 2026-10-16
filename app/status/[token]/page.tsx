import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Application status",
};

import { getPublicStatus } from "@/lib/candidates/public-status-service";

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

          {status.assessmentScore !== null && status.assessmentMax !== null ? (
            <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Assessment score
              </p>
              <p className="mt-0.5 text-2xl font-bold text-zinc-900">
                {status.assessmentScore}
                <span className="text-base font-normal text-zinc-400"> / {status.assessmentMax}</span>
              </p>
            </div>
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
