"use client";

import { useState } from "react";

/**
 * Accept / decline on the public offer page. POSTs to hash-verified routes.
 */
export default function OfferDecisionButtons({ token }: { token: string }) {
  const [state, setState] = useState<
    "idle" | "accepting" | "declining" | "accepted" | "declined" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function post(path: "accept" | "decline") {
    setState(path === "accept" ? "accepting" : "declining");
    try {
      const res = await fetch(`/api/offer/${encodeURIComponent(token)}/${path}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        if (path === "accept") {
          setState("accepted");
          setMessage(
            body.alreadyAccepted
              ? "This offer was already accepted."
              : "Offer accepted — the hiring team has been notified.",
          );
        } else {
          setState("declined");
          setMessage(
            body.alreadyDeclined
              ? "This offer was already declined."
              : "Offer declined. The hiring team has been notified.",
          );
        }
      } else {
        setState("error");
        setMessage(body?.error ?? "Could not record your decision.");
      }
    } catch {
      setState("error");
      setMessage("Network error — please try again.");
    }
  }

  if (state === "accepted") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          ✓ {message}
        </div>
        <a
          href={`/api/offer/${encodeURIComponent(token)}/letter`}
          className="inline-flex rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
        >
          Open joining letter
        </a>
      </div>
    );
  }

  if (state === "declined") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-medium text-zinc-700">
        {message}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void post("accept")}
          disabled={state === "accepting" || state === "declining"}
          className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {state === "accepting" ? "Accepting…" : "I accept this offer"}
        </button>
        <button
          type="button"
          onClick={() => void post("decline")}
          disabled={state === "accepting" || state === "declining"}
          className="rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          {state === "declining" ? "Declining…" : "Decline"}
        </button>
      </div>
      {state === "error" ? (
        <p className="mt-2 text-sm text-red-600">{message}</p>
      ) : null}
    </div>
  );
}
