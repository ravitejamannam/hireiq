import Link from "next/link";

/**
 * Guided first-run checklist for brand-new client workspaces.
 * Shown until the company posts its first role.
 */

const STEPS = [
  {
    n: 1,
    title: "Post your first role",
    body: "Add the title, skills and compensation. Publishing takes under two minutes.",
    cta: { label: "Post a role", href: "/client/requirements" },
  },
  {
    n: 2,
    title: "Share your apply link",
    body: "Every published role gets a secure HireIQ apply page you can paste anywhere — job boards, LinkedIn, email.",
    cta: null,
  },
  {
    n: 3,
    title: "Review candidates",
    body: "Applicants land in your pipeline, take a role assessment, and appear ranked by skill evidence for your shortlist decision.",
    cta: null,
  },
];

export default function ClientOnboardingChecklist() {
  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50/70 to-white p-8">
      <h2 className="text-lg font-bold text-zinc-900">
        Welcome to HireIQ — let&apos;s make your first hire
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Three steps and your role is live to candidates.
      </p>

      <ol className="mt-6 space-y-4">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="flex items-start gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
              {step.n}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-zinc-900">{step.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-zinc-600">
                {step.body}
              </p>
              {step.cta ? (
                <Link
                  href={step.cta.href}
                  className="mt-2 inline-block rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                >
                  {step.cta.label} →
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
