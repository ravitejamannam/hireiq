"use client";

import { useState } from "react";

type Slot = { id: number; startAt: string; durationMinutes: number };

export default function SlotPicker({
  token,
  slots,
}: {
  token: string;
  slots: Slot[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "submitting" } | { kind: "booked"; at: string } | { kind: "error"; text: string }
  >({ kind: "idle" });

  async function onBook() {
    if (selected === null) return;
    setState({ kind: "submitting" });
    const res = await fetch(`/api/schedule/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: selected }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok: true; scheduledAt: string }
      | { ok: false; error?: string }
      | null;

    if (res.ok && body?.ok) {
      setState({ kind: "booked", at: new Date(body.scheduledAt).toLocaleString() });
    } else {
      const code = body && !body.ok ? body.error : "BOOKING_FAILED";
      setState({
        kind: "error",
        text:
          code === "SLOT_UNAVAILABLE" || code === "SLOT_DURATION_MISMATCH"
            ? "That slot is not available for this booking link — please pick another."
            : "Booking failed. Please refresh and try again.",
      });
      setSelected(null);
    }
  }

  if (state.kind === "booked") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="font-medium text-emerald-800">✓ Interview booked</p>
        <p className="mt-1 text-sm text-emerald-700">{state.at}</p>
        <p className="mt-2 text-xs text-emerald-600">
          A calendar hold has been made with the interviewer. Keep an eye on
          your email for details.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Available time slots">
        {slots.map((slot) => {
          const start = new Date(slot.startAt);
          const selectedSlot = selected === slot.id;
          return (
            <li key={slot.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selectedSlot}
                onClick={() => setSelected(slot.id)}
                disabled={state.kind === "submitting"}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                  selectedSlot
                    ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                }`}
              >
                <span className="block font-semibold">
                  {start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className="text-xs">
                  {start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} ·{" "}
                  {slot.durationMinutes} min
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onBook}
        disabled={selected === null || state.kind === "submitting"}
        className="mt-4 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state.kind === "submitting" ? "Booking…" : "Book this time"}
      </button>

      {state.kind === "error" ? (
        <p className="mt-2 text-sm text-red-600">{state.text}</p>
      ) : null}
    </div>
  );
}
