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
  leaderboardHref: string;
};

function remainingLabel(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) {
    return "Window closed";
  }
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m remaining`;
}

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
  const [integrity, setIntegrity] = useState({ tabSwitches: 0, pastes: 0, copies: 0 });
  const [result, setResult] = useState<{
    score: number;
    maxScore: number;
  } | null>(
    alreadySubmitted && score !== null && maxScore !== null
      ? { score, maxScore }
      : null,
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(remainingLabel(expiresAt));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  // T101 integrity telemetry (client-self-reported). Counts focus loss and
  // clipboard activity during the attempt; submitted with the final answers.
  useEffect(() => {
    if (alreadySubmitted) return;
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
  }, [alreadySubmitted]);

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

      setResult({
        score: body.score ?? 0,
        maxScore: body.maxScore ?? 0,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
        <p>
          Score: {result.score} / {result.maxScore}
        </p>
        <a
          href={leaderboardHref}
          className="mt-3 inline-block font-semibold text-black underline underline-offset-2"
        >
          View leaderboard
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <p className="text-sm font-medium text-black">{remaining}</p>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {questions.map((question, index) => (
        <fieldset key={question.id} className="space-y-3">
          <legend className="text-sm font-semibold text-black">
            {index + 1}. {question.prompt}
          </legend>
          {question.choices.map((choice, choiceIndex) => (
            <label
              key={`${question.id}-${choiceIndex}`}
              className="flex items-start gap-2 text-sm text-zinc-700"
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                value={choiceIndex}
                disabled={pending}
                checked={answers[String(question.id)] === choiceIndex}
                onChange={() =>
                  setAnswers((current) => ({
                    ...current,
                    [String(question.id)]: choiceIndex,
                  }))
                }
                className="mt-1"
              />
              <span>{choice}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-400"
      >
        {pending ? "Submitting…" : "Submit assessment"}
      </button>
    </form>
  );
}
