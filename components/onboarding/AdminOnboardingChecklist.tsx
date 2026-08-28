import Link from "next/link";

/**
 * Guided first-run checklist for brand-new ADMIN workspaces (T120).
 * Mirrors the client checklist but covers the full hiring workflow:
 * company setup → job spec → distribution → pipeline.
 */

const STEPS = [
  {
    n: 1,
    title: "Create your company workspace",
    body: "Set up the organisation your jobs, candidates and evidence will belong to.",
    cta: { label: "Company settings", href: "/dashboard/company" },
    done: (ctx: AdminChecklistContext) => ctx.hasCompany,
  },
  {
    n: 2,
    title: "Post a job specification",
    body: "Define skills, experience and assessment questions. Specs are versioned — once published, changes create a new version.",
    cta: { label: "New requirement", href: "/dashboard/requirements" },
    done: (ctx: AdminChecklistContext) => ctx.hasJob,
  },
  {
    n: 3,
    title: "Share the apply link",
    body: "Every published role gets a hosted apply page with resume upload. Candidates can apply from any channel.",
    cta: { label: "Requirements", href: "/dashboard/requirements" },
    done: (ctx: AdminChecklistContext) => ctx.hasJob,
  },
  {
    n: 4,
    title: "Review the ranked pipeline",
    body: "Applicants land in CV Pool, take assessments, and are ranked by skill-evidence coverage. Move them through Expert Review → Shortlist.",
    cta: { label: "Open pipeline", href: "/dashboard/pipeline" },
    done: (ctx: AdminChecklistContext) => ctx.hasShortlisted,
  },
];

export type AdminChecklistContext = {
  hasCompany: boolean;
  hasJob: boolean;
  hasShortlisted: boolean;
};

export default function AdminOnboardingChecklist({
  context,
}: {
  context: AdminChecklistContext;
}) {
  const doneCount = STEPS.filter((s) => s.done(context)).length;
  if (doneCount === STEPS.length) return null;

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50/70 to-white p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-zinc-900">
          Getting started with HireIQ
        </h2>
        <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
          {doneCount}/{STEPS.length} complete
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-600">
        Four steps to your first shortlisted candidate.
      </p>

      <ol className="mt-6 space-y-4">
        {STEPS.map((step) => {
          const isDone = step.done(context);
          return (
            <li
              key={step.n}
              className={`flex items-start gap-4 rounded-xl border px-5 py-4 ${
                isDone
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                  isDone ? "bg-emerald-600" : "bg-indigo-600"
                }`}
              >
                {isDone ? "✓" : step.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${isDone ? "text-emerald-800" : "text-zinc-900"}`}>
                  {step.title}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-600">
                  {step.body}
                </p>
                {!isDone && step.cta ? (
                  <Link
                    href={step.cta.href}
                    className="mt-2 inline-block rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                  >
                    {step.cta.label} →
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
