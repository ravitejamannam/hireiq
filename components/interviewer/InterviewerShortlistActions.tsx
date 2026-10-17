"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApplicationPipelineStatus } from "@prisma/client";

import { transitionInterviewerApplicationStatus } from "@/app/actions/application-actions";
import { submitInterviewerHiringRecommendation } from "@/app/actions/evaluation-actions";

type InterviewerShortlistActionsProps = {
  applicationId: number;
  status: ApplicationPipelineStatus;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Update could not be saved.";
}

export default function InterviewerShortlistActions({
  applicationId,
  status,
}: InterviewerShortlistActionsProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedRecommendation, setSavedRecommendation] = useState<string | null>(
    null,
  );

  if (currentStatus !== ApplicationPipelineStatus.TECH_EVALUATION) {
    return null;
  }

  async function handleShortlist() {
    if (isSaving) return;
    setErrorMessage(null);
    setIsSaving(true);
    try {
      const updated = await transitionInterviewerApplicationStatus(
        applicationId,
        ApplicationPipelineStatus.SHORTLISTED,
      );
      setCurrentStatus(updated.status);
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRecommendation(recommendation: "HIRE" | "NO_HIRE") {
    if (isSaving) return;
    setErrorMessage(null);
    setIsSaving(true);
    try {
      const saved = await submitInterviewerHiringRecommendation(
        applicationId,
        recommendation,
        reason,
      );
      setSavedRecommendation(saved.recommendation);
      setReason("");
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
          onClick={() => void handleShortlist()}
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {isSaving ? "Updating..." : "Add to Shortlist"}
        </button>
      </div>
      <div className="mt-4">
        <label
          className="block text-sm font-medium text-black"
          htmlFor="hiring-recommendation-reason"
        >
          Hiring recommendation
        </label>
        <p className="mt-1 text-sm text-zinc-600">
          Hire or No Hire is your recommendation. It does not hire or reject
          the candidate.
        </p>
        <textarea
          id="hiring-recommendation-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Written reason (required)"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleRecommendation("HIRE")}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
          >
            Recommend Hire
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleRecommendation("NO_HIRE")}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
          >
            Recommend No Hire
          </button>
        </div>
        {savedRecommendation ? (
          <p className="mt-2 text-sm text-zinc-700">
            Recommendation saved:{" "}
            {savedRecommendation === "HIRE" ? "Hire" : "No Hire"}.
          </p>
        ) : null}
      </div>
      {errorMessage ? (
        <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
      ) : null}
    </div>
  );
}
