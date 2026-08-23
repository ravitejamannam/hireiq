import {
  DecisionSupportError,
  getDecisionSupportForCandidate,
} from "@/lib/candidates/decision-support-service";

const KIND_STYLES: Record<string, { badge: string; icon: string }> = {
  EXPERT_SCORE: { badge: "bg-violet-50 text-violet-700 ring-violet-600/20", icon: "★" },
  ASSESSMENT: { badge: "bg-sky-50 text-sky-700 ring-sky-600/20", icon: "◆" },
  MATCHING: { badge: "bg-teal-50 text-teal-700 ring-teal-600/20", icon: "⇄" },
  EVALUATION: { badge: "bg-indigo-50 text-indigo-700 ring-indigo-600/20", icon: "☰" },
  INTERVIEW: { badge: "bg-zinc-100 text-zinc-700 ring-zinc-500/20", icon: "🗣" },
  CODING_TEST: { badge: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20", icon: "{ }" },
  REPORT: { badge: "bg-orange-50 text-orange-700 ring-orange-600/20", icon: "📄" },
};

type PanelProps = {
  candidateId: number;
};

export default async function CandidateSignalsPanel({
  candidateId,
}: PanelProps) {
  let view;
  try {
    view = await getDecisionSupportForCandidate(candidateId);
  } catch (error) {
    if (error instanceof DecisionSupportError && error.code === "CANDIDATE_NOT_FOUND") {
      return null;
    }
    throw error;
  }

  const groupedByRail = new Map<string, typeof view.signals>();
  for (const signal of view.signals) {
    const list = groupedByRail.get(signal.kind) ?? [];
    list.push(signal);
    groupedByRail.set(signal.kind, list);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-900">Hiring signals</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Every signal on its own terms — deliberately not combined into a
            single score. Weights and decisions remain human.
          </p>
        </div>
        <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
          {view.signals.length} signals
        </span>
      </div>

      {view.signals.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          No signals recorded yet for this candidate.
        </p>
      ) : (
        <ul className="mt-5 space-y-5">
          {[...groupedByRail.entries()].map(([kind, signals]) => {
            const style = KIND_STYLES[kind] ?? {
              badge: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
              icon: "•",
            };
            return (
              <li key={kind}>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}
                  >
                    {style.icon} {kind.replace("_", " ")}
                  </span>
                  <span className="text-xs text-zinc-400">{signals.length}</span>
                </div>
                <ul className="mt-2 space-y-2 pl-1">
                  {signals.map((signal, i) => (
                    <li
                      key={`${signal.kind}-${i}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-lg border border-zinc-100 px-4 py-2.5"
                    >
                      <span className="text-sm font-medium text-zinc-800">{signal.label}</span>
                      <span className="text-sm font-semibold text-zinc-900">{signal.detail}</span>
                      {signal.meta ? (
                        <span className="w-full text-xs text-zinc-400">{signal.meta}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
