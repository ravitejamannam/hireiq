"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApplicationPipelineStatus } from "@prisma/client";

import { transitionInterviewerApplicationStatus } from "@/app/actions/application-actions";

type InterviewerShortlistActionsProps = {
  applicationId: number;
  status: ApplicationPipelineStatus;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Pipeline update could not be saved.";
}

export default function InterviewerShortlistActions({
  applicationId,
  status,
}: InterviewerShortlistActionsProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (currentStatus !== ApplicationPipelineStatus.TECH_EVALUATION) {
    return null;
  }

  async function handleTransition(nextStatus: ApplicationPipelineStatus) {
    if (isSaving) return;

    setErrorMessage(null);
    setIsSaving(true);

    try {
      const updated = await transitionInterviewerApplicationStatus(
        applicationId,
        nextStatus,
      );
      setCurrentStatus(updated.status);
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isSaving}
          onClick={() =>
            void handleTransition(ApplicationPipelineStatus.SHORTLISTED)
          }
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {isSaving ? "Updating..." : "Add to Shortlist"}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() =>
            void handleTransition(ApplicationPipelineStatus.REJECTED)
          }
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
        >
          Reject
        </button>
      </div>
      {errorMessage ? (
        <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
      ) : null}
    </div>
  );
}
