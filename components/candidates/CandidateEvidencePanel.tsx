"use client";

import { useState } from "react";

import { revokeCandidateEvidence } from "@/app/actions/candidate-evidence-actions";
import type { SafeCandidateEvidence } from "@/lib/candidates/evidence/evidence-types";

type CandidateEvidencePanelProps = {
  evidence: SafeCandidateEvidence[];
};

function captureDate(value: Date | string) {
  const iso = typeof value === "string" ? value : value.toISOString();
  return iso.slice(0, 10);
}

export default function CandidateEvidencePanel({
  evidence,
}: CandidateEvidencePanelProps) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [rows, setRows] = useState(evidence);

  async function handleRevoke(evidenceId: number) {
    if (!window.confirm("Revoke this evidence artifact?")) {
      return;
    }

    setError("");
    setMessage("");
    setPendingId(evidenceId);

    try {
      const result = await revokeCandidateEvidence(evidenceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows((current) =>
        current.map((item) =>
          item.id === result.evidence.id ? result.evidence : item,
        ),
      );
      setMessage("Evidence artifact revoked. The record was preserved.");
    } catch {
      setError("Unable to revoke this evidence artifact.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Evidence</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Append-only source artifacts. Cover letters are candidate-provided.
        Resume files are not stored.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 text-sm text-zinc-700" role="status">
          {message}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600">
          No evidence artifacts are recorded for this candidate.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {rows.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-zinc-200 p-4 text-sm"
            >
              <p className="font-medium text-black">
                {item.sourceType}
                <span className="font-normal text-zinc-600">
                  {" "}
                  · {item.origin}
                </span>
              </p>
              <p className="mt-1 text-zinc-600">
                Captured {captureDate(item.createdAt)}
                {item.jobTitle ? ` · ${item.jobTitle}` : ""}
                {item.applicationId ? ` · Application ${item.applicationId}` : ""}
              </p>
              <p className="mt-1 text-zinc-600">
                {item.isRevoked ? "Revoked" : "Active"}
                {item.isSuperseded ? " · Superseded" : ""}
                {item.supersededById
                  ? ` by evidence ${item.supersededById}`
                  : ""}
              </p>
              {item.inlineText ? (
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-zinc-700">
                  {item.inlineText}
                </pre>
              ) : (
                <p className="mt-3 text-zinc-600">No cover letter text.</p>
              )}
              {!item.isRevoked ? (
                <button
                  type="button"
                  onClick={() => void handleRevoke(item.id)}
                  disabled={pendingId !== null}
                  className="mt-3 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                >
                  {pendingId === item.id ? "Revoking..." : "Revoke"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
