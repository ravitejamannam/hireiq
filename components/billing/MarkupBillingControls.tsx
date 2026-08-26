"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  recordPlacementCompensationAction,
  setAgencyMarkupAction,
} from "@/app/actions/markup-billing-actions";

/**
 * T132 admin controls for transparent markup billing.
 */

export function AgencyMarkupSetter({ currentBps }: { currentBps: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(currentBps !== null ? String(currentBps / 100) : "");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSave() {
    const pct = Number.parseFloat(value);
    if (Number.isNaN(pct) || pct < 0 || pct > 500) {
      setNotice("Enter a markup between 0 and 500.");
      return;
    }
    startTransition(async () => {
      const res = await setAgencyMarkupAction(Math.round(pct * 100));
      setNotice(res.ok ? `✓ Markup saved at ${pct}%.` : res.error);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h3 className="text-sm font-bold text-black">Agency markup</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Applied to every placement. Clients see the exact math: compensation ×
        markup = fee.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 10"
          inputMode="decimal"
          className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-sm text-zinc-500">%</span>
        <button
          type="button"
          onClick={onSave}
          disabled={isPending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {notice ? <p className="mt-2 text-sm text-emerald-700">{notice}</p> : null}
    </div>
  );
}

export function RecordCompensationForm({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [ctcLakhs, setCtcLakhs] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onRecord() {
    // Input in lakhs/year (₹X LPA) → paise. ₹1 L = 100_000 ₹ = 10_000_000 paise.
    const lakhs = Number.parseFloat(ctcLakhs);
    if (Number.isNaN(lakhs) || lakhs <= 0) {
      setNotice("Enter annual compensation in lakhs, e.g. 24.");
      return;
    }
    const cents = Math.round(lakhs * 100_000 * 100);
    startTransition(async () => {
      const res = await recordPlacementCompensationAction(applicationId, cents);
      if (res.ok) {
        setNotice(
          `✓ Fee recorded: ₹${(res.placedCtcCents / 100).toLocaleString("en-IN")} × ${(res.markupBps / 100).toFixed(1)}% = ₹${(res.feeCents / 100).toLocaleString("en-IN")}`,
        );
        router.refresh();
      } else {
        setNotice(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <input
        value={ctcLakhs}
        onChange={(e) => setCtcLakhs(e.target.value)}
        placeholder="Placed CTC (₹ LPA)"
        inputMode="decimal"
        className="w-44 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        type="button"
        onClick={onRecord}
        disabled={isPending}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
      >
        {isPending ? "Recording…" : "Record compensation"}
      </button>
      {notice ? <span className="text-xs text-emerald-700">{notice}</span> : null}
    </div>
  );
}
