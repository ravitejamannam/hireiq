"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createWebhookSubscription,
  deleteWebhookSubscription,
  toggleWebhookSubscription,
} from "@/app/actions/webhook-subscription-actions";

type Subscription = {
  id: number;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
};

const AVAILABLE_EVENTS = [
  { value: "application.status_changed", label: "Application status changed" },
  { value: "assessment.completed", label: "Assessment completed" },
  { value: "interview.scheduled", label: "Interview scheduled" },
];

export default function WebhookSubscriptionsPanel({
  companyId,
  initialSubscriptions,
}: {
  companyId: number;
  initialSubscriptions: Subscription[];
}) {
  const router = useRouter();
  const [subs, setSubs] = useState(initialSubscriptions);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["application.status_changed"]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function onCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createWebhookSubscription({
        companyId,
        url,
        events,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewSecret(res.signingSecret);
      setUrl("");
      router.refresh();
    });
  }

  function onToggle(id: number, active: boolean) {
    startTransition(async () => {
      await toggleWebhookSubscription(id, companyId, active);
      setSubs((prev) =>
        prev.map((s) => (s.id === id ? { ...s, active } : s)),
      );
    });
  }

  function onDelete(id: number) {
    startTransition(async () => {
      await deleteWebhookSubscription(id, companyId);
      setSubs((prev) => prev.filter((s) => s.id !== id));
    });
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <label className="block text-xs font-medium text-zinc-500">
          Endpoint URL (https only)
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://partner.example.com/hooks/hireiq"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <fieldset className="flex flex-wrap gap-4">
          {AVAILABLE_EVENTS.map((ev) => (
            <label key={ev.value} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={events.includes(ev.value)}
                onChange={() =>
                  setEvents((prev) =>
                    prev.includes(ev.value)
                      ? prev.filter((v) => v !== ev.value)
                      : [...prev, ev.value],
                  )
                }
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              {ev.label}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={onCreate}
          disabled={isPending || !url.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {isPending ? "Creating…" : "+ Add subscription"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      {/* Signing secret shown once */}
      {newSecret ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            ✓ Subscription created — copy the signing secret now. You won&apos;t see it again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-zinc-900 px-3 py-2 font-mono text-xs text-emerald-300">
              {newSecret}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(newSecret);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-700">
            Verify payloads with header <code>x-hireiq-signature</code> (HMAC-SHA256 of the raw body).
          </p>
        </div>
      ) : null}

      {/* List */}
      <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {["Endpoint", "Events", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {subs.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-400">No subscriptions yet.</td></tr>
            ) : (
              subs.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-zinc-900">{s.url}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{s.events.join(", ")}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        s.active
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-zinc-100 text-zinc-500 ring-zinc-400/20"
                      }`}
                    >
                      {s.active ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onToggle(s.id, !s.active)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                    >
                      {s.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id)}
                      className="text-xs font-semibold text-red-600 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
