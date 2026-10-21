"use client";

import { useState } from "react";

export default function PracticalSubmitForm({ token }: { token: string }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/practical/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(url.trim() ? { text, url: url.trim() } : { text }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; code?: string } | null;
      if ((response.ok && body?.ok) || body?.code === "SUBMITTED") {
        setDone(true);
        return;
      }
      setError(body?.error ?? "Submission failed. Try again.");
    } catch {
      setError("Submission failed because of a connection problem. Your text is still here; try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Submitted. The hiring team will review it and contact you about next steps.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold text-zinc-900">Your work</span>
        <span className="mt-1 block text-xs text-zinc-500">
          Paste your solution or a written explanation: what you did, key decisions, how you checked it, and known limitations.
        </span>
        <textarea
          required
          minLength={20}
          maxLength={50_000}
          rows={12}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-zinc-900">Link (optional)</span>
        <span className="mt-1 block text-xs text-zinc-500">A repository, document, or file share. Must start with https://.</span>
        <input
          type="url"
          inputMode="url"
          pattern="https://.*"
          maxLength={500}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Submitting…" : "Submit practical"}
      </button>
      <p className="text-xs text-zinc-500">You can submit once. Make sure everything is included before you press submit.</p>
    </form>
  );
}
