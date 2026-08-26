"use client";

import { useState } from "react";

/**
 * Accept button on the public offer page. POSTs to the verify route;
 * the server re-validates the token hash before stamping.
 */
export default function OfferAcceptButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "accepting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onAccept() {
    setState("accepting");
    try {
      const res = await fetch(`/api/offer/${encodeURIComponent(token)}/accept`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        setState("done");
        setMessage(
          body.alreadyAccepted
            ? "This offer was already accepted."
            : "Offer accepted — the hiring team has been notified.",
        );
      } else {
        setState("error");
        setMessage(body?.error ?? "Could not accept this offer.");
      }
    } catch {
      setState("error");
      setMessage("Network error — please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
        ✓ {message}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onAccept}
        disabled={state === "accepting"}
        className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {state === "accepting" ? "Accepting…" : "I accept this offer"}
      </button>
      {state === "error" ? (
        <p className="mt-2 text-sm text-red-600">{message}</p>
      ) : null}
    </div>
  );
}
