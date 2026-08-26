"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createApiTokenAction,
  revokeApiTokenAction,
} from "@/app/actions/api-token-actions";

type TokenView = {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revoked: boolean;
};

/**
 * T140 (audit fix): full API key lifecycle UI — create (secret shown
 * exactly once), list with status, revoke. Tenant-scoped server-side.
 */
export default function ApiTokenManager({
  initialTokens,
}: {
  initialTokens: TokenView[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createApiTokenAction(name);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (!res.apiKey) {
        setError("Empty key returned.");
        return;
      }
      setNewSecret(res.apiKey);
      setName("");
      router.refresh();
    });
  }

  function onRevoke(id: number) {
    startTransition(async () => {
      const res = await revokeApiTokenAction(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-xs font-medium text-zinc-500">
          Key name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production server"
            maxLength={80}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <button
          type="button"
          onClick={onCreate}
          disabled={isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {isPending ? "Creating…" : "+ Create API key"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {newSecret ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            ✓ API key created — copy it now; you won&apos;t see it again.
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
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {["Name", "Created", "Last used", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {initialTokens.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-400">
                  No API keys yet.
                </td>
              </tr>
            ) : (
              initialTokens.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{t.name}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    {!t.revoked ? (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-500/20">
                        Revoked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!t.revoked ? (
                      <button
                        type="button"
                        onClick={() => onRevoke(t.id)}
                        disabled={isPending}
                        className="text-xs font-semibold text-red-600 hover:text-red-500"
                      >
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
