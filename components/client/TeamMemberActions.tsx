"use client";

import { useState, useTransition } from "react";

import {
  removeOrganizationMember,
  reinstateOrganizationMember,
  suspendOrganizationMember,
  transferOwnership,
} from "@/app/actions/organization-actions";

type Member = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
};

type Action = "suspend" | "reinstate" | "remove" | "transfer";

const CONFIRM_LABELS: Record<Action, string> = {
  suspend: "Suspend",
  reinstate: "Reinstate",
  remove: "Remove permanently",
  transfer: "Transfer ownership",
};

export default function TeamMemberActions({ member }: { member: Member }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Action | null>(null);

  function run(action: Action) {
    setError(null);
    setConfirming(null);
    startTransition(async () => {
      const result =
        action === "suspend"
          ? await suspendOrganizationMember(member.id)
          : action === "reinstate"
            ? await reinstateOrganizationMember(member.id)
            : action === "remove"
              ? await removeOrganizationMember(member.id)
              : await transferOwnership(member.id);

      if (!result.ok) {
        setError(result.error ?? "Action failed. Please try again.");
      }
    });
  }

  function onClick(action: Action) {
    // Destructive or irreversible-feeling actions get one confirmation step.
    if (action === "remove" || action === "transfer") {
      setConfirming(action);
      return;
    }
    run(action);
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-700">
          {CONFIRM_LABELS[confirming]} — are you sure?
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(confirming)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${
            confirming === "remove" ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500"
          }`}
        >
          {isPending ? "Working…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(null)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
        {error ? <p className="w-full text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {member.status === "ACTIVE" && member.role === "MEMBER" ? (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onClick("suspend")}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Suspend
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onClick("transfer")}
            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            Make owner
          </button>
        </>
      ) : null}
      {member.status === "SUSPENDED" && member.role === "MEMBER" ? (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onClick("reinstate")}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            Reinstate
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onClick("remove")}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Remove
          </button>
        </>
      ) : null}
      {member.status === "REMOVED" ? (
        <span className="text-xs text-zinc-400">Membership removed</span>
      ) : null}
      {error ? <p className="w-full text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
