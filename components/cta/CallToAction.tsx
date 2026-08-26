import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function CallToAction() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#FBF9F4] to-[#F3EDE3] py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-[#E05B3F]/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-semibold text-stone-700 shadow-sm">
          <ShieldCheck size={14} />
          Evidence-first. Human-decided. Fully explainable.
        </span>
        <h2 className="mt-6 text-4xl font-black tracking-tight text-zinc-950 md:text-6xl">
          Your next hire should come with proof.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-600">
          Post your first role in under two minutes. Every application,
          assessment and decision after that — traceable forever.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-2 rounded-full bg-stone-900 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-zinc-900/10 transition hover:bg-zinc-700"
          >
            Start hiring free
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-8 py-4 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50"
          >
            Log in
          </Link>
        </div>
      </div>
    </section>
  );
}
