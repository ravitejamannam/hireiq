"use client";

import { useState } from "react";

type TokenView = {
  id: number;
  name: string;
  createdAt: string;
  revoked: boolean;
};

export default function ApiTokenManager({
  initialTokens,
}: {
  initialTokens: TokenView[];
}) {
  const [tokens] = useState(initialTokens);

  return (
    <table className="min-w-full divide-y divide-zinc-200 text-sm">
      <thead className="bg-zinc-50">
        <tr>
          {["Name", "Created", "Status"].map((h) => (
            <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {tokens.length === 0 ? (
          <tr>
            <td colSpan={3} className="px-4 py-6 text-center text-sm text-zinc-400">
              No API keys yet.
            </td>
          </tr>
        ) : (
          tokens.map((t) => (
            <tr key={t.id} className="hover:bg-zinc-50">
              <td className="px-4 py-3 font-medium text-zinc-900">{t.name}</td>
              <td className="px-4 py-3 text-xs text-zinc-400">
                {new Date(t.createdAt).toLocaleDateString()}
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
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
