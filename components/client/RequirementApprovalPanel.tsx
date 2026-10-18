"use client";

import { useState, useTransition } from "react";

import { approveJobRequirement } from "@/app/actions/requirement-approval-actions";

export type RequirementApprovalRow = {
  id: number;
  sourceText: string;
  requirementType: string;
  evidenceType: string | null;
  approvalStatus: string;
};

export default function RequirementApprovalPanel({
  jobId,
  rows,
}: {
  jobId: number;
  rows: RequirementApprovalRow[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (rows.length === 0) return null;

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Requirements</h2>
      <p className="mt-1 text-sm text-zinc-600">
        AI drafts stay unapproved until you accept them. Publish needs an approved required item with an evidence type.
      </p>
      <ul className="mt-4 space-y-4">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-zinc-200 p-4">
            <p className="text-sm font-medium text-zinc-900">{row.sourceText}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {row.requirementType} · {row.approvalStatus}
              {row.evidenceType ? ` · ${row.evidenceType}` : ""}
            </p>
            {row.approvalStatus !== "APPROVED" ? (
              <form
                className="mt-3 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const evidenceType = String(data.get("evidenceType") ?? "");
                  startTransition(async () => {
                    try {
                      await approveJobRequirement({
                        jobId,
                        requirementId: row.id,
                        evidenceType,
                      });
                      setMessage("Requirement approved.");
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Approval failed.");
                    }
                  });
                }}
              >
                <label className="text-sm text-zinc-700">
                  Evidence
                  <select
                    name="evidenceType"
                    defaultValue={row.evidenceType ?? "RESUME"}
                    className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                  >
                    <option value="RESUME">Resume</option>
                    <option value="ASSESSMENT">Assessment</option>
                    <option value="INTERVIEW">Interview</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Approve
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {message ? <p className="mt-3 text-sm text-zinc-700">{message}</p> : null}
    </section>
  );
}
