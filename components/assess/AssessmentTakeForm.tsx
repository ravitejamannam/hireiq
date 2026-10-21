"use client";

import { useEffect, useState, type FormEvent } from "react";

type Question = {
  id: number;
  prompt: string;
  choices: string[];
};

type AssessmentTakeFormProps = {
  token: string;
  expiresAt: string;
  questions: Question[];
  alreadySubmitted: boolean;
  score: number | null;
  maxScore: number | null;
  leaderboardHref?: string;
};

function remainingLabel(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { text: "Window closed", urgent: true };
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const urgent = hours === 0 && minutes < 30;
  return {
    text: hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`,
    urgent,
  };
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function AssessmentTakeForm({
  token,
  expiresAt,
  questions,
  alreadySubmitted,
  score,
  maxScore,
  leaderboardHref,
}: AssessmentTakeFormProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState(() => remainingLabel(expiresAt));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    score: number;
    maxScore: number;
  } | null>(
    alreadySubmitted && score !== null && maxScore !== null
      ? { score, maxScore }
      : null,
  );

  // Integrity telemetry (client-self-reported; see T101)
  const [integrity, setIntegrity] = useState({
    tabSwitches: 0,
    pastes: 0,
    copies: 0,
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(remainingLabel(expiresAt));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (alreadySubmitted || result) return;
    function bump(key: "tabSwitches" | "pastes" | "copies") {
      setIntegrity((prev) => ({ ...prev, [key]: prev[key] + 1 }));
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") bump("tabSwitches");
    }
    function onPaste() {
      bump("pastes");
    }
    function onCopy() {
      bump("copies");
    }
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("paste", onPaste);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("copy", onCopy);
    };
  }, [alreadySubmitted, result]);

  const answeredCount = questions.filter(
    (q) => answers[String(q.id)] !== undefined,
  ).length;
  const allAnswered = answeredCount === questions.length;
  const progressPct = Math.round((answeredCount / questions.length) * 100);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const payload: Record<string, number> = {};
      for (const question of questions) {
        const selected = answers[String(question.id)];
        if (selected === undefined) {
          setError("Answer every question before submitting.");
          setPending(false);
          return;
        }
        payload[String(question.id)] = selected;
      }

      const response = await fetch(`/api/assess/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload, integrity }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            score?: number;
            maxScore?: number;
          }
        | null;

      if (response.status === 429) {
        setError("Too many attempts. Try again later.");
        return;
      }

      if (!response.ok || !body?.success) {
        setError(body?.error ?? "This assessment is unavailable.");
        return;
      }

      setResult({ score: body.score ?? 0, maxScore: body.maxScore ?? 0 });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // ── Success state ──
  if (result) {
    const pct = result.maxScore
      ? Math.round((result.score / result.maxScore) * 100)
      : 0;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          ✓
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-emerald-900">
          Assessment complete
        </h2>
        <p className="mt-6 text-5xl font-extrabold tracking-tight text-emerald-700">
          {pct}%
        </p>
        <p className="mt-1 text-sm font-medium text-emerald-600">
          {result.score} of {result.maxScore} points
        </p>
        <p className="mt-3 text-sm text-emerald-800">
          This is your score on this role&apos;s assessment, not a hire
          decision. A recruiter reviews it alongside the rest of your
          application.
        </p>
        {leaderboardHref ? (
          <a
            href={leaderboardHref}
            className="mt-6 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
          >
            See where you stand →
          </a>
        ) : null}
      </div>
    );
  }

  const urgent = remaining.urgent;

  // ── Taking state ──
  return (
    <form onSubmit={onSubmit} noValidate>
      {/* Sticky progress header */}
      <div className="sticky top-0 z-10 -mx-6 mb-6 border-b border-zinc-200 bg-white/90 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                urgent
                  ? "bg-red-50 text-red-700 ring-red-600/20"
                  : "bg-zinc-100 text-zinc-700 ring-zinc-500/20"
              }`}
            >
              ⏱ {remaining.text}
            </span>
            <span className="text-xs text-zinc-400">
              {answeredCount}/{questions.length} answered
            </span>
          </div>
          <button
            type="submit"
            disabled={pending}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              allAnswered && !urgent
                ? "bg-indigo-600 hover:bg-indigo-500"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            {pending ? "Submitting…" : "Submit assessment"}
          </button>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {error ? (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      ) : null}

      {/* Questions */}
      <ol className="space-y-6">
        {questions.map((question, index) => {
          const selected = answers[String(question.id)];
          return (
            <li
              key={question.id}
              className={`rounded-2xl border p-6 transition ${
                selected !== undefined
                  ? "border-indigo-200 bg-indigo-50/30"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <fieldset>
                <legend className="flex items-start gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      selected !== undefined
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-200 text-zinc-600"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="pt-0.5 text-base font-semibold leading-relaxed text-zinc-900">
                    {question.prompt}
                  </span>
                </legend>

                <div className="mt-4 space-y-2 pl-10" role="radiogroup" aria-label={`Choices for question ${index + 1}`}>
                  {question.choices.map((choice, choiceIndex) => {
                    const isChecked = selected === choiceIndex;
                    return (
                      <label
                        key={`${question.id}-${choiceIndex}`}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                          isChecked
                            ? "border-indigo-500 bg-indigo-50/70 font-medium text-indigo-900"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          value={choiceIndex}
                          disabled={pending}
                          checked={isChecked}
                          onChange={() =>
                            setAnswers((current) => ({
                              ...current,
                              [String(question.id)]: choiceIndex,
                            }))
                          }
                          className="sr-only"
                        />
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                            isChecked
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-zinc-300 text-zinc-500"
                          }`}
                        >
                          {LETTERS[choiceIndex]}
                        </span>
                        {choice}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      {/* Bottom submit for long forms */}
      <div className="mt-8 flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-sm text-zinc-500">
          {allAnswered
            ? "✓ All questions answered — ready to submit."
            : `${questions.length - answeredCount} question${
                questions.length - answeredCount === 1 ? "" : "s"
              } remaining`}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "Submitting…" : "Submit final answers"}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-zinc-400">
        Focus and clipboard activity are counted and shown to the recruiter as
        context only. They are never used to reject an application.
      </p>
    </form>
  );
}
