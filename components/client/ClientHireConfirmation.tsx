"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationPipelineStatus } from "@prisma/client";

import { confirmClientCandidateHire } from "@/app/actions/application-actions";
import { getClientPipelineStatusLabel } from "@/components/client/client-labels";

type ClientHireConfirmationProps = {
  applicationId: number;
  candidateName: string;
  status: ApplicationPipelineStatus;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to confirm hire. Please try again.";
}

export default function ClientHireConfirmation({
  applicationId,
  candidateName,
  status,
}: ClientHireConfirmationProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirmHire() {
    if (isPending) {
      return;
    }

    setActionError(null);

    startTransition(async () => {
      try {
        await confirmClientCandidateHire(applicationId);
        setConfirming(false);
        router.refresh();
      } catch (error) {
        setActionError(getErrorMessage(error));
      }
    });
  }

  if (status === "HIRED") {
    return (
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Hiring status
        </p>
        <p className="mt-2 text-lg font-bold text-black">
          {getClientPipelineStatusLabel(status)}
        </p>
        <p className="mt-2 text-sm font-medium text-black">Hire confirmed</p>
        <p className="mt-1 text-sm text-zinc-700">Billing generated.</p>
      </section>
    );
  }

  if (status !== "SELECTED") {
    return null;
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Client decision
      </p>
      <dl className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Status</dt>
          <dd className="font-medium text-black">
            {getClientPipelineStatusLabel(status)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Hiring status</dt>
          <dd className="font-medium text-black">Awaiting confirmation</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-zinc-600">
        Confirm Hire to mark this candidate hired. Billing has not been
        generated.
      </p>

      {actionError ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {actionError}
        </p>
      ) : null}

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setActionError(null);
          setConfirming(true);
        }}
        className="mt-4 inline-flex rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Confirming..." : "Confirm Hire"}
      </button>

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-hire-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2
              id="confirm-hire-title"
              className="text-xl font-bold text-black"
            >
              Confirm hire?
            </h2>
            <p className="mt-3 text-sm text-zinc-600">
              Confirming hire for{" "}
              <span className="font-medium text-black">{candidateName}</span>{" "}
              will mark them Hired and generate billing for this requirement.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmHire}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {isPending ? "Confirming..." : "Confirm Hire"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
