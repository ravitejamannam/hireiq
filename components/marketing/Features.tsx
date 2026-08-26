import {
  FileSearch,
  Eye,
  Link2,
  ListChecks,
  Scale,
  Users,
} from "lucide-react";

const PILLARS = [
  {
    icon: FileSearch,
    title: "Evidence before intelligence",
    body: "No invented facts. Every skill, every claim traces to a source artifact — a resume, a submission, an assessment answer — with cryptographic hashes proving it hasn't changed.",
  },
  {
    icon: Eye,
    title: "No black-box scores",
    body: "Rankings come from deterministic, explainable evidence coverage. You can always ask why a candidate ranked where they did — and get an answer in plain language.",
  },
  {
    icon: Users,
    title: "Humans decide",
    body: "HireIQ never auto-rejects or auto-hires. Machine output is decision support; the shortlist call is always yours. That's architecture, not policy.",
  },
  {
    icon: Link2,
    title: "One link, everywhere",
    body: "Publish once — hosted apply pages, embeddable widgets, XML feeds, Google Jobs structure, and a public REST API. Your role reaches every channel in minutes.",
  },
  {
    icon: ListChecks,
    title: "Assessments that adapt",
    body: "Role-calibrated question banks draw a fresh difficulty-balanced mix per candidate. Exposure tracking and retirement keep answer keys from leaking.",
  },
  {
    icon: Scale,
    title: "Transparent to everyone",
    body: "Candidates see their standing. Clients see the fee math — compensation × markup = fee, no hidden numbers. Trust is the product.",
  },
];

export default function Features() {
  return (
    <section id="ideology" className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-sm font-bold uppercase tracking-widest text-indigo-600">
          The ideology
        </p>
        <h2 className="mx-auto mt-3 max-w-3xl text-center text-4xl font-black tracking-tight text-zinc-950 md:text-5xl">
          Built on principles competitors won&apos;t copy
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-zinc-600">
          Most hiring tools optimize for clicks. HireIQ is architected so
          that trust is unavoidable — these aren&apos;t settings, they&apos;re
          the foundation.
        </p>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((pillar) => (
            <article
              key={pillar.title}
              className="group rounded-2xl border border-zinc-200 bg-white p-7 transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                <pillar.icon size={20} />
              </span>
              <h3 className="mt-5 text-lg font-bold text-zinc-900">
                {pillar.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                {pillar.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
