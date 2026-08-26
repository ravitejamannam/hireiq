import Link from "next/link";
import {
  Briefcase,
  Share2,
  ClipboardCheck,
  BarChart3,
  Handshake,
  Receipt,
  ArrowRight,
} from "lucide-react";

const STEPS = [
  {
    icon: Briefcase,
    step: "01",
    title: "Post a role",
    body: "Define skills, experience and assessment questions in a versioned specification. Publish takes under two minutes.",
  },
  {
    icon: Share2,
    step: "02",
    title: "Share everywhere",
    body: "One apply link for LinkedIn, email and WhatsApp — plus embeddable widgets, XML feeds and API access built in.",
  },
  {
    icon: ClipboardCheck,
    step: "03",
    title: "Candidates prove themselves",
    body: "Applications capture structured evidence. Adaptive assessments score ability instantly, with integrity signals.",
  },
  {
    icon: BarChart3,
    step: "04",
    title: "Review the ranked pipeline",
    body: "Candidates ranked by evidence coverage — every ranking explainable. Move people through review with one click.",
  },
  {
    icon: Handshake,
    step: "05",
    title: "Interview & select together",
    body: "Structured rubrics, self-serve scheduling, and a transparent shortlist your client confirms with one click.",
  },
  {
    icon: Receipt,
    step: "06",
    title: "Hire with open math",
    body: "Signed offer acceptance, then billing where the fee formula is shown to everyone: compensation × markup = fee.",
  },
];

export default function HowItWorks() {
  return (
    <section id="workflow" className="bg-zinc-950 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-sm font-bold uppercase tracking-widest text-indigo-400">
          The workflow
        </p>
        <h2 className="mx-auto mt-3 max-w-3xl text-center text-4xl font-black tracking-tight text-white md:text-5xl">
          From role to hire, end to end
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-zinc-400">
          One platform for the entire journey — no duct-taped tools, no
          lost context, no untraceable decisions.
        </p>

        <ol className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.step}
              className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/60 p-7 transition hover:border-indigo-500/40 hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-400 ring-1 ring-inset ring-indigo-500/30">
                  <s.icon size={20} />
                </span>
                <span className="text-4xl font-black text-zinc-800 transition group-hover:text-indigo-500/30">
                  {s.step}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-14 text-center">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500"
          >
            Run your first role today
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
