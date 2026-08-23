"use client";

import { useState, useTransition } from "react";

import { replayQuarantinedDelivery } from "@/app/actions/webhook-delivery-actions";

type ReplayButtonProps = {
  deliveryId: number;
};

export default function ReplayButton({ deliveryId }: ReplayButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function onReplay() {
    setMessage(null);
    startTransition(async () => {
      const result = await replayQuarantinedDelivery(deliveryId);
      if (result.ok) {
        setMessage({ ok: true, text: "Replay succeeded — delivery promoted to ACCEPTED." });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onReplay}
        disabled={isPending}
        className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Replaying…" : "↻ Replay delivery"}
      </button>
      {message ? (
        <p
          className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
