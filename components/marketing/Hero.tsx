import Link from "next/link";

import {
  ArrowRight,
  BadgeCheck,
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
    <section className="bg-[#FBF9F4]">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-20 md:pt-28">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
          {/* Copy */}
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700">
              <BadgeCheck size={13} className="text-[#E05B3F]" />
              Evidence-first hiring infrastructure
            </p>

            <h1 className="mt-6 text-5xl font-black leading-[1.04] tracking-tight text-stone-950 md:text-6xl lg:text-7xl">
              Hiring you can{" "}
              <span className="relative inline-block text-[#E05B3F]">
                prove.
                <svg
                  aria-hidden
                  viewBox="0 0 120 12"
                  className="absolute -bottom-1 left-0 w-full text-[#E05B3F]/50"
                  fill="none"
                >
                  <path
                    d="M2 9C30 3 70 3 118 8"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-8 text-stone-600">
              Every candidate fact traced to a source artifact. Every ranking
              explained in plain language. No black-box scores — ever.
              HireIQ is recruiting built on proof, not vibes.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-7 py-3.5 text-sm font-bold text-[#FBF9F4] transition hover:bg-stone-700"
              >
                Start hiring free
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <a
                href="#workflow"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-7 py-3.5 text-sm font-bold text-stone-800 transition hover:border-stone-400"
              >
                See how it works
              </a>
            </div>

            <p className="mt-6 flex items-center gap-2 text-xs font-medium text-stone-500">
              <span className="flex -space-x-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="h-2 w-2 rounded-full bg-sky-500" />
              </span>
              No credit card · Post your first role in under two minutes
            </p>
          </div>

          {/* Card mock */}
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[2rem] bg-[#E05B3F]/[0.07] rotate-2"
            />
            <div className="relative rounded-3xl border border-stone-200 bg-white p-6 shadow-xl shadow-stone-200/60">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
                  Shortlist
                </p>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-stone-600">
                  ranked by evidence coverage
                </span>
              </div>
              <ul className="mt-5 space-y-3">
                {PIPELINE_MOCK.map((c, i) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-stone-150 border-stone-200/80 bg-[#FBF9F4] px-4 py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${
                          i === 0
                            ? "bg-[#E05B3F] text-white"
                            : "bg-stone-200 text-stone-700"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-stone-900">{c.name}</p>
                        <p className="text-xs text-stone-500">{c.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="hidden items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-inset ring-stone-200 sm:inline-flex">
                        <FileSearch size={11} /> {c.tag}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-black ${
                          i === 0 ? "bg-[#E05B3F] text-white" : "bg-stone-900 text-white"
                        }`}
                      >
                        <Trophy size={11} /> {c.score}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-2xl bg-stone-900 px-4 py-3">
                <p className="text-xs font-medium text-stone-300">
                  Humans make the call — HireIQ never auto-rejects or
                  auto-hires.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
