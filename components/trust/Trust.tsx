import { Ban, Brain, FileClock } from "lucide-react";

const CARDS = [
  {
    icon: Ban,
    title: "No auto-rejections. Ever.",
    body:
      "AI-agent interviewers reject candidates nobody ever talks to. HireIQ's architecture makes that impossible — a human reviews every single application.",
  },
  {
    icon: Brain,
    title: "AI where it helps. Nowhere it decides.",
    body:
      "AI drafts job descriptions and extracts claims from resumes — always labeled, always traceable to source. It never scores your fit or picks your shortlist.",
  },
  {
    icon: FileClock,
    title: "Every decision has a paper trail",
    body:
      "Application → match run → claim → evidence → source. When someone asks 'why was this person ranked #3?', the answer exists — hashed and immutable.",
  },
];

export default function Trust() {
  return (
    <section id="proof" className="border-t border-stone-200/70 bg-[#FBF9F4] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-sm font-bold uppercase tracking-widest text-[#E05B3F]">
          The difference
        </p>
        <h2 className="mx-auto mt-3 max-w-3xl text-center text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
          In an AI-hiring gold rush, we&apos;re the proof
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-stone-600">
          Automated hiring tools are creating a trust vacuum. Candidates
          don&apos;t trust opaque rejections; companies can&apos;t defend
          them. HireIQ is built for what comes next.
        </p>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="rounded-3xl border border-stone-200 bg-white p-7"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-stone-900 text-[#FBF9F4]">
                <card.icon size={20} />
              </span>
              <h3 className="mt-5 text-lg font-bold text-stone-900">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                {card.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
