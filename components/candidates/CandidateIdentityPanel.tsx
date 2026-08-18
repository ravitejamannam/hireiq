"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  linkCandidates,
  unlinkCandidate,
} from "@/app/actions/candidate-identity-actions";
import type { CandidateIdentityExplanation } from "@/lib/candidates/identity/identity-types";

const LINK_CONFIRMATION =
  "This links candidate records logically. Applications and profiles remain separate.";

type CandidateIdentityPanelProps = {
  identity: CandidateIdentityExplanation;
};

function statusLabel(status: CandidateIdentityExplanation["status"]) {
  switch (status) {
    case "LINKED":
      return "Linked to Company Person";
    case "POSSIBLE_DUPLICATES":
      return "Possible duplicates";
    default:
      return "Not linked";
  }
}

export default function CandidateIdentityPanel({
  identity,
}: CandidateIdentityPanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);

  async function handleLink(otherCandidateId: number) {
    if (
      !window.confirm(
        `${LINK_CONFIRMATION}\n\nLink candidate ${identity.candidateId} with candidate ${otherCandidateId}?`,
      )
    ) {
      return;
    }

    setError("");
    setMessage("");
    setPendingId(otherCandidateId);

    try {
      const result = await linkCandidates(identity.candidateId, otherCandidateId);
      if (!result.ok) {
        setError(
          result.conflict
            ? `${result.error} Identity groups were not merged.`
            : result.error,
        );
        return;
      }
      setMessage(
        result.idempotent
          ? "These candidates are already linked."
          : "Candidates linked logically. Applications and profiles remain separate.",
      );
      router.refresh();
    } catch {
      setError("Unable to link these candidates.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleUnlink() {
    if (
      !window.confirm(
        "Unlink this candidate from the company person? The candidate, applications, and profile stay in place.",
      )
    ) {
      return;
    }

    setError("");
    setMessage("");
    setPendingId(identity.candidateId);

    try {
      const result = await unlinkCandidate(identity.candidateId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        result.unlinked
          ? "Candidate unlinked. Records were preserved."
          : "This candidate is not linked.",
      );
      router.refresh();
    } catch {
      setError("Unable to unlink this candidate.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Identity</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Admin-review identity only. Linking is logical. Applications and
        profiles remain separate.
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

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-black">Identity status</dt>
          <dd className="mt-1 text-zinc-600">{statusLabel(identity.status)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Company Person</dt>
          <dd className="mt-1 text-zinc-600">
            {identity.companyPersonId ?? "Not linked"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-black">Candidate</dt>
          <dd className="mt-1 text-zinc-600">{identity.candidateId}</dd>
        </div>
      </dl>

      {identity.companyPersonId ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-black">Linked candidates</h3>
          {identity.linkedCandidates.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              No other candidates are in this company person.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-zinc-600">
              {identity.linkedCandidates.map((linked) => (
                <li key={linked.candidateId}>
                  <Link
                    href={`/dashboard/candidates/${linked.candidateId}`}
                    className="font-medium text-black underline underline-offset-2"
                  >
                    {linked.name}
                  </Link>
                  <span> · ID {linked.candidateId}</span>
                  {linked.location ? <span> · {linked.location}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void handleUnlink()}
            disabled={pendingId !== null}
            className="mt-4 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
          >
            {pendingId === identity.candidateId ? "Unlinking..." : "UNLINK"}
          </button>
        </div>
      ) : null}

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-black">Possible duplicates</h3>
        {identity.possibleDuplicates.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            No exact identity-signal matches in this company.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {identity.possibleDuplicates.map((duplicate) => (
              <li
                key={duplicate.candidateId}
                className="rounded-lg border border-zinc-200 p-4 text-sm"
              >
                <p className="font-medium text-black">
                  {duplicate.name}{" "}
                  <span className="font-normal text-zinc-600">
                    · ID {duplicate.candidateId}
                  </span>
                </p>
                <p className="mt-1 text-zinc-600">
                  {duplicate.location ?? "Location not provided"}
                  {duplicate.currentEmployer
                    ? ` · ${duplicate.currentEmployer}`
                    : ""}
                </p>
                <p className="mt-1 text-zinc-600">
                  Matching reason: {duplicate.matchingReasons.join(", ")}
                </p>
                {duplicate.belongsToDifferentCompanyPerson ? (
                  <p className="mt-2 text-red-600">
                    This candidate belongs to a different Company Person.
                    Groups are not merged automatically.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleLink(duplicate.candidateId)}
                    disabled={pendingId !== null}
                    className="mt-3 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {pendingId === duplicate.candidateId ? "Linking..." : "LINK"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-black">Identity signals</h3>
        {identity.signals.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            No identity signals are recorded for this candidate.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-zinc-600">
            {identity.signals.map((signal) => (
              <li key={signal.id}>
                {signal.kind}: {signal.maskedValue}
                {signal.sourceChannel ? ` · ${signal.sourceChannel}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-black">Decisions</h3>
        {identity.decisions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No identity decisions yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-zinc-600">
            {identity.decisions.map((decision) => (
              <li key={decision.id}>
                {decision.decision} · {decision.reasonCodes.join(", ")} ·{" "}
                {(typeof decision.createdAt === "string"
                  ? decision.createdAt
                  : decision.createdAt.toISOString()
                ).slice(0, 10)}
                {decision.actorName ? ` · ${decision.actorName}` : ""}
                {decision.actorUserId ? ` · Admin user ${decision.actorUserId}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
