"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CodeAnswer } from "@/components/assessments/CodeAnswer";

type Item = { id: string; type: string; prompt: string; choices: string[]; language: string | null; starter: string | null };

type Page = {
  title: string;
  companyName: string | null;
  timeLimitMinutes: number;
  extraTimeRequested: boolean;
  instructions: string | null;
  linkExpiresAt: string;
  started: boolean;
  deadline: string | null;
  itemCount: number;
  measures: string[];
  hasWrittenItems: boolean;
  answers: Record<string, string>;
  items: Item[];
};

function formatRemaining(ms: number) {
  if (ms <= 0) return "Time is up";
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")} left`;
}

export default function GeneratedAssessmentForm({ token, page }: { token: string; page: Page }) {
  const router = useRouter();
  const endpoint = `/api/assess/${encodeURIComponent(token)}/generated`;
  const [answers, setAnswers] = useState<Record<string, string>>(page.answers);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const dirty = useRef<Record<string, string>>({});
  const integrity = useRef<{ tabSwitches: number; pastes: number; itemSeconds: Record<string, number> }>({ tabSwitches: 0, pastes: 0, itemSeconds: {} });
  const [activeItem, setActiveItem] = useState<string | null>(page.items[0]?.id ?? null);
  const activeRef = useRef<string | null>(activeItem);
  const [itemSeconds, setItemSeconds] = useState<Record<string, number>>({});
  const submitting = useRef(false);
  const submitRef = useRef<() => Promise<void>>(async () => undefined);
  const autoSubmitted = useRef(false);
  const draftKey = `assess-draft:${token}`;
  const [draftRestored, setDraftRestored] = useState(false);

  const persistDraft = useCallback(() => {
    try {
      if (Object.keys(dirty.current).length === 0) sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, JSON.stringify(dirty.current));
    } catch {
      // Storage can be unavailable (private mode, quota); autosave still runs.
    }
  }, [draftKey]);

  // A refresh can render before the last save lands, so unconfirmed edits come back from this tab.
  useEffect(() => {
    if (!page.started) return;
    let draft: Record<string, string> | null = null;
    try {
      draft = JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as Record<string, string> | null;
    } catch {
      draft = null;
    }
    if (!draft || Object.keys(draft).length === 0) return;
    dirty.current = { ...draft, ...dirty.current };
    // Session storage is browser-only, so it can only be read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswers((current) => ({ ...current, ...draft }));
    setDraftRestored(true);
  }, [draftKey, page.started]);

  const deadline = page.deadline ? new Date(page.deadline).getTime() : null;
  const remaining = deadline ? deadline - now : null;

  useEffect(() => {
    if (!page.started) return;
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      const active = activeRef.current;
      if (active && document.visibilityState === "visible") {
        const seconds = (integrity.current.itemSeconds[active] ?? 0) + 1;
        integrity.current.itemSeconds = { ...integrity.current.itemSeconds, [active]: seconds };
        setItemSeconds(integrity.current.itemSeconds);
      }
      if (deadline !== null && tick >= deadline && !autoSubmitted.current) {
        autoSubmitted.current = true;
        void submitRef.current();
      }
    }, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") integrity.current.tabSwitches += 1;
    };
    const onPaste = () => {
      integrity.current.pastes += 1;
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("paste", onPaste);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("paste", onPaste);
    };
  }, [page.started, deadline]);

  const flush = useCallback(async () => {
    const patch = dirty.current;
    if (Object.keys(patch).length === 0) return true;
    dirty.current = {};
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: patch, integrity: integrity.current }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; code?: string } | null;
    if (!response || !response.ok || !body?.ok) {
      if (body?.code !== "TIME_UP") dirty.current = { ...patch, ...dirty.current };
      persistDraft();
      setError(body?.error ?? "Could not save. Check your connection; your answers stay on this page and will retry.");
      return false;
    }
    persistDraft();
    setError(null);
    setStatus(`Saved at ${new Date().toLocaleTimeString()}`);
    return true;
  }, [endpoint, persistDraft]);

  useEffect(() => {
    if (!page.started || submitted) return;
    const timer = window.setInterval(() => void flush(), 4000);
    // Edits made since the last autosave would be lost on refresh or close.
    const onPageHide = () => {
      const patch = dirty.current;
      if (Object.keys(patch).length === 0) return;
      void fetch(endpoint, {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: patch, integrity: integrity.current }),
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [endpoint, flush, page.started, submitted]);

  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: { ...dirty.current }, integrity: integrity.current }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; code?: string } | null;
      if ((response.ok && body?.ok) || body?.code === "SUBMITTED") {
        dirty.current = {};
        persistDraft();
        setSubmitted(true);
        return;
      }
      setError(body?.error ?? "Submission failed. Your saved answers are kept. Try again.");
      submitting.current = false;
    } catch {
      setError("Submission failed because of a connection problem. Your saved answers are kept. Try again.");
      submitting.current = false;
    } finally {
      setPending(false);
    }
  }, [endpoint, persistDraft]);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  function focusItem(itemId: string) {
    activeRef.current = itemId;
    setActiveItem(itemId);
  }

  function update(itemId: string, value: string) {
    setAnswers((current) => ({ ...current, [itemId]: value }));
    dirty.current = { ...dirty.current, [itemId]: value };
    persistDraft();
    setStatus("Unsaved changes");
  }

  async function start() {
    setPending(true);
    setError(null);
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setPending(false);
    if (!response?.ok || !body?.ok) {
      setError(body?.error ?? "Could not start the assessment. Try again.");
      return;
    }
    router.refresh();
  }

  if (submitted) {
    return (
      <article className="rounded-2xl border border-emerald-200 bg-white p-10" role="status">
        <h1 className="text-2xl font-bold text-emerald-900">Assessment submitted</h1>
        <p className="mt-3 text-sm text-zinc-700">
          Thank you. Your answers were received. A recruiter reviews them with the rest of your application. You will hear
          about next steps by email.
        </p>
      </article>
    );
  }

  if (!page.started) {
    return (
      <article className="rounded-2xl border border-zinc-200 bg-white p-8">
        {page.companyName ? <p className="text-sm text-zinc-500">{page.companyName}</p> : null}
        <h1 className="mt-1 text-2xl font-bold text-black">{page.title}</h1>
        <dl className="mt-6 space-y-4 text-sm text-zinc-700">
          <div>
            <dt className="font-semibold text-black">What it measures</dt>
            <dd className="mt-1">
              {page.itemCount} questions on skills this role needs
              {page.measures.length > 0 ? `: ${page.measures.join("; ")}.` : "."}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-black">Time</dt>
            <dd className="mt-1">
              {page.timeLimitMinutes} minutes{page.extraTimeRequested ? " plus 50% extra time" : ""} from when you press Start.
              The link itself expires {new Date(page.linkExpiresAt).toLocaleString()}.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-black">Allowed resources</dt>
            <dd className="mt-1 whitespace-pre-wrap">
              {page.instructions ?? "Work on your own. You may use a plain text editor. Do not ask another person or an AI tool to answer for you."}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-black">How it is evaluated</dt>
            <dd className="mt-1">
              Multiple-choice answers are scored automatically.
              {page.hasWrittenItems
                ? " Written answers are graded against a rubric. An AI model may draft a grade, but only if it quotes your own words; anything uncertain goes to a person."
                : ""}{" "}
              The result is one input a recruiter reviews. It is never the only reason for a decision, and you will not see a score
              here.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-black">Privacy</dt>
            <dd className="mt-1">
              Your answers are visible only to the hiring team for this role. Focus and paste counts are recorded as context and are
              never used on their own to reject an application.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-black">Accommodations and technical problems</dt>
            <dd className="mt-1">
              Request extra time before you start if you need it. Answers save every few seconds; if your connection drops, reopen
              this link and continue. If something prevents you from finishing, reply to the invitation email.
            </dd>
          </div>
        </dl>
        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => void start()} disabled={pending} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Starting…" : "Start the assessment"}
          </button>
          <form method="post" action={`/assess/${encodeURIComponent(token)}/extra-time`}>
            <button type="submit" disabled={page.extraTimeRequested} className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 disabled:opacity-60">
              {page.extraTimeRequested ? "Extra time added" : "Request extra time"}
            </button>
          </form>
        </div>
      </article>
    );
  }

  const answered = page.items.filter((item) => (answers[item.id] ?? "").trim() !== "").length;
  const suggestedSeconds = page.items.length > 0 ? Math.floor((page.timeLimitMinutes * 60 * (page.extraTimeRequested ? 1.5 : 1)) / page.items.length) : 0;
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      noValidate
      className="rounded-2xl border border-zinc-200 bg-white p-6"
    >
      <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-zinc-200 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="text-sm">
          <span className={`font-semibold ${remaining !== null && remaining < 120_000 ? "text-red-700" : "text-zinc-900"}`} aria-live="polite">
            {remaining !== null ? formatRemaining(remaining) : ""}
          </span>
          <span className="ml-3 text-zinc-500">{answered}/{page.items.length} answered</span>
          <span className="ml-3 text-xs text-zinc-500">About {clock(suggestedSeconds)} per question suggested</span>
          {status ? <span className="ml-3 text-xs text-zinc-500">{status}</span> : null}
        </div>
        <button type="submit" disabled={pending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Submitting…" : "Submit"}
        </button>
      </div>
      {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <ol className="space-y-6">
        {page.items.map((item, index) => (
          <li
            key={item.id}
            className={`rounded-xl border p-4 ${activeItem === item.id ? "border-zinc-500" : "border-zinc-200"}`}
            onFocusCapture={() => focusItem(item.id)}
            onPointerDown={() => focusItem(item.id)}
          >
            <p className="mb-2 text-xs text-zinc-500" aria-live={activeItem === item.id ? "polite" : "off"}>
              Time on this question {clock(itemSeconds[item.id] ?? 0)}
              {(itemSeconds[item.id] ?? 0) > suggestedSeconds ? " · over the suggested time; move on if you are stuck" : ""}
            </p>
            {item.type === "multiple_choice" ? (
              <fieldset>
                <legend className="text-sm font-semibold text-zinc-900">{index + 1}. {item.prompt}</legend>
                <div className="mt-3 space-y-2">
                  {item.choices.map((choice, choiceIndex) => (
                    <label key={`${item.id}-${choiceIndex}`} className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:border-zinc-400">
                      <input
                        type="radio"
                        name={item.id}
                        value={choiceIndex}
                        checked={answers[item.id] === String(choiceIndex)}
                        onChange={() => update(item.id, String(choiceIndex))}
                        className="mt-0.5"
                      />
                      <span>{choice}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : item.type === "coding" ? (
              <div>
                <p className="text-sm font-semibold text-zinc-900">{index + 1}. {item.prompt}</p>
                <CodeAnswer
                  key={`${item.id}:${draftRestored}`}
                  label={`Answer to question ${index + 1}`}
                  language={item.language ?? "javascript"}
                  value={answers[item.id] ?? item.starter ?? ""}
                  onChange={(value) => update(item.id, value)}
                />
                <span className="mt-1 block text-xs text-zinc-500">
                  {item.language ? `Write ${item.language}. ` : ""}Code is checked on the server after you submit, or reviewed by a person when automated checks are unavailable.
                </span>
              </div>
            ) : (
              <label className="block">
                <span className="text-sm font-semibold text-zinc-900">{index + 1}. {item.prompt}</span>
                {item.type === "scenario" ? <span className="block text-xs text-zinc-500">Explain your answer: say what you would do and why.</span> : null}
                <textarea
                  value={answers[item.id] ?? (item.type === "coding" ? item.starter ?? "" : "")}
                  onChange={(event) => update(item.id, event.target.value)}
                  rows={item.type === "coding" ? 10 : 5}
                  maxLength={20_000}
                  spellCheck={item.type !== "coding"}
                  className={`mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm ${item.type === "coding" ? "font-mono" : ""}`}
                />
                {item.type === "coding" ? (
                  <span className="mt-1 block text-xs text-zinc-500">
                    {item.language ? `Write ${item.language}. ` : ""}Code is checked on the server after you submit, or reviewed by a person when automated checks are unavailable.
                  </span>
                ) : null}
              </label>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">You can submit with unanswered questions. When the timer ends, your saved answers are submitted.</p>
        <button type="submit" disabled={pending} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Submitting…" : "Submit final answers"}
        </button>
      </div>
    </form>
  );
}
