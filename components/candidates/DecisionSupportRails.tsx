type Signal = {
  kind: string;
  label: string;
  detail: string;
  meta: string | null;
};

const RAIL_META: Record<string, { label: string; icon: string; accent: string }> = {
  EXPERT_SCORE: { label: "Recruiter input", icon: "★", accent: "violet" },
  ASSESSMENT: { label: "Role assessment", icon: "◆", accent: "sky" },
  MATCHER_V1_COVERAGE: { label: "Matcher V1 coverage", icon: "⇄", accent: "teal" },
  MATCHER_V2_ASSESSMENT: { label: "Matcher V2 assessment", icon: "≡", accent: "emerald" },
  T94_EVIDENCE_COVERAGE_RANKING: { label: "T94 coverage ranking", icon: "#", accent: "teal" },
  M8_LEXICAL_RETRIEVAL: { label: "M8 lexical retrieval", icon: "L", accent: "sky" },
  M9_SEMANTIC_RETRIEVAL: { label: "M9 semantic retrieval", icon: "S", accent: "indigo" },
  EVALUATION: { label: "Interviewer evaluation", icon: "☰", accent: "indigo" },
  INTERVIEW: { label: "Interviews", icon: "🗣", accent: "zinc" },
  CODING_TEST: { label: "Coding tests", icon: "{ }", accent: "fuchsia" },
  REPORT: { label: "Panel reports", icon: "📄", accent: "orange" },
};

const ACCENT_CLASSES: Record<string, { badge: string; bar: string; text: string }> = {
  violet: { badge: "bg-violet-50 text-violet-700 ring-violet-600/20", bar: "bg-violet-500", text: "text-violet-700" },
  sky: { badge: "bg-sky-50 text-sky-700 ring-sky-600/20", bar: "bg-sky-500", text: "text-sky-700" },
  teal: { badge: "bg-teal-50 text-teal-700 ring-teal-600/20", bar: "bg-teal-500", text: "text-teal-700" },
  emerald: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", bar: "bg-emerald-500", text: "text-emerald-700" },
  indigo: { badge: "bg-indigo-50 text-indigo-700 ring-indigo-600/20", bar: "bg-indigo-500", text: "text-indigo-700" },
  zinc: { badge: "bg-zinc-100 text-zinc-700 ring-zinc-500/20", bar: "bg-zinc-500", text: "text-zinc-700" },
  fuchsia: { badge: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20", bar: "bg-fuchsia-500", text: "text-fuchsia-700" },
  orange: { badge: "bg-orange-50 text-orange-700 ring-orange-600/20", bar: "bg-orange-500", text: "text-orange-700" },
};

function pctFromDetail(detail: string): number | null {
  const m = detail.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  return Math.round((Number(m[1]) / Number(m[2])) * 100);
}

export default function DecisionSupportRails({
  signals,
}: {
  signals: Signal[];
}) {
  const railOrder = [
    "EXPERT_SCORE",
    "ASSESSMENT",
    "MATCHER_V1_COVERAGE",
    "MATCHER_V2_ASSESSMENT",
    "T94_EVIDENCE_COVERAGE_RANKING",
    "M8_LEXICAL_RETRIEVAL",
    "M9_SEMANTIC_RETRIEVAL",
    "EVALUATION",
    "INTERVIEW",
    "CODING_TEST",
    "REPORT",
  ];
  const grouped = railOrder
    .map((kind) => ({
      kind,
      items: signals.filter((s) => s.kind === kind),
    }))
    .filter((g) => g.items.length > 0);

  if (grouped.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-10 text-center">
        <h2 className="text-lg font-semibold text-zinc-900">No signals yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
          As this candidate moves through assessments, interviews and reviews,
          every signal will appear here with full provenance — never collapsed
          into a single opaque score.
        </p>
      </section>
    );
  }

  const recommendationCount = signals.filter((s) =>
    ["STRONG_HIRE", "HIRE"].includes(s.detail),
  ).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-gradient-to-r from-indigo-50/60 to-transparent px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Decision support
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Every signal on its own terms — provenance preserved, weights
              visible, nothing hidden behind a single number.
            </p>
          </div>
          <div className="flex items-center gap-6 text-right">
            <div>
              <p className="text-2xl font-bold text-zinc-900">{signals.length}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                signals
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">
                {recommendationCount}
              </p>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                hire votes
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900">{grouped.length}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                rails
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-100">
        {grouped.map(({ kind, items }) => {
          const meta = RAIL_META[kind] ?? {
            label: kind,
            icon: "•",
            accent: "zinc",
          };
          const accent = ACCENT_CLASSES[meta.accent] ?? ACCENT_CLASSES.zinc;
          return (
            <div key={kind} className="px-8 py-6">
              <div className="mb-4 flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${accent.badge}`}
                >
                  <span aria-hidden>{meta.icon}</span> {meta.label}
                </span>
                <span className="text-xs text-zinc-400">
                  {items.length} {items.length === 1 ? "signal" : "signals"}
                </span>
              </div>

              <ul className="space-y-3">
                {items.map((signal, index) => {
                  const pct = pctFromDetail(signal.detail);
                  return (
                    <li
                      key={`${kind}-${index}`}
                      className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-5 py-4 transition hover:border-zinc-200 hover:bg-white"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                        <p className="text-sm font-medium text-zinc-800">
                          {signal.label}
                        </p>
                        <p className={`text-sm font-bold ${accent.text}`}>
                          {signal.detail}
                        </p>
                      </div>
                      {pct !== null ? (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
                          <div
                            className={`h-full rounded-full ${accent.bar}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      ) : null}
                      {signal.meta ? (
                        <p className="mt-1.5 text-xs text-zinc-400">{signal.meta}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
