"use client";

import { useState, useTransition } from "react";

import { triggerReconciliationSweep } from "@/app/actions/integrations-actions";

export default function RunReconciliationButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function onRun() {
    setMessage(null);
    startTransition(async () => {
      const result = await triggerReconciliationSweep();
      if (result.ok) {
        const s = result.summary;
        setMessage({
          ok: true,
          text: `Sweep complete — ${s.checked} checked · ${s.ok} OK · ${s.drift} drift · ${s.error} error · ${s.skipped} skipped`,
        });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onRun}
        disabled={isPending}
        className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Running sweep…" : "▶ Run reconciliation now"}
      </button>
      {message ? (
        <span className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-600"}`} role="status">
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
