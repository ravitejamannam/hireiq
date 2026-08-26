import Link from "next/link";

import {
  ShieldCheck,
  Eye,
  UserCheck,
  ArrowRight,
  FileSearch,
  Trophy,
} from "lucide-react";

const PIPELINE_MOCK = [
  { name: "Priya Sharma", role: "Senior Backend", score: 94, tag: "Evidence rank #1" },
  { name: "Arjun Nair", role: "Senior Backend", score: 88, tag: "6/6 skills proven" },
  { name: "Meera Iyer", role: "Senior Backend", score: 81, tag: "Kafka · verified" },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/80 via-white to-white">
      {/* soft background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-200/40 via-violet-200/40 to-sky-200/40 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 text-center md:pt-28">
        <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm">
          <ShieldCheck size={14} />
          Evidence-first hiring infrastructure
        </p>

        <h1 className="mx-auto mt-8 max-w-4xl text-5xl font-black leading-[1.05] tracking-tight text-zinc-950 md:text-7xl">
          Hiring you can{" "}
          <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 bg-clip-text text-transparent">
            prove.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
          Every candidate fact traced to a source artifact. Every ranking
          explained in plain language. No black-box scores — ever. HireIQ is
          the recruiting platform built on proof, not vibes.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-zinc-900/10 transition hover:bg-zinc-700"
          >
            Start hiring free
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          <a
            href="#workflow"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-7 py-3.5 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50"
          >
            See how it works
          </a>
        </div>

        {/* Pipeline mock */}
        <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-zinc-200 bg-white/90 p-2 shadow-2xl shadow-indigo-100 backdrop-blur">
          <div className="rounded-xl border border-zinc-100 bg-white p-5 text-left">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                Shortlist · ranked by evidence coverage
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <Eye size={11} /> Fully explainable
              </span>
            </div>
            <ul className="mt-4 space-y-3">
              {PIPELINE_MOCK.map((c, i) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between gap-4 rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{c.name}</p>
                      <p className="text-xs text-zinc-500">{c.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600 sm:inline-flex">
                      <FileSearch size={11} /> {c.tag}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                      <Trophy size={11} /> {c.score}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
              <UserCheck size={12} /> Humans make the call — HireIQ never
              auto-rejects or auto-hires.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
