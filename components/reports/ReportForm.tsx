"use client";

import { useState } from "react";
import type { Recommendation } from "@prisma/client";
import type { getApplications } from "@/lib/repositories/application-repository";

type Application = Awaited<ReturnType<typeof getApplications>>[number];

export type ReportFormData = {
  applicationId: number;
  recommendation: Recommendation;
  notes: string | null;
};

type ReportFormProps = {
  onCreate: (report: ReportFormData) => void;
  onCancel: () => void;
  applications: Application[];
  initialValues?: {
    applicationId: number;
    recommendation: Recommendation;
    notes: string | null;
  };
};

export default function ReportForm({
  onCreate,
  onCancel,
  applications,
  initialValues,
}: ReportFormProps) {
  const [applicationId, setApplicationId] = useState(
    initialValues?.applicationId.toString() ?? "",
  );
  const [recommendation, setRecommendation] = useState(
    initialValues?.recommendation ?? "",
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");

  const [applicationError, setApplicationError] = useState("");
  const [recommendationError, setRecommendationError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setApplicationError("");
    setRecommendationError("");

    if (!applicationId.trim()) {
      setApplicationError("Application is required.");
      valid = false;
    }

    if (!recommendation.trim()) {
      setRecommendationError("Recommendation is required.");
      valid = false;
    }

    if (!valid) return;

    onCreate({
      applicationId: Number(applicationId),
      recommendation: recommendation as Recommendation,
      notes: notes.trim() ? notes.trim() : null,
    });
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="report-application"
          className="block text-sm font-medium text-black"
        >
          Application
        </label>

        <select
          id="report-application"
          value={applicationId}
          onChange={(event) => setApplicationId(event.target.value)}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            outline-none
            transition
            focus:border-black
          "
        >
          <option value="">Select Application</option>
          {applications.map((application) => (
            <option key={application.id} value={application.id}>
              {application.candidate.name} - {application.job.title} -{" "}
              {application.job.company.name}
            </option>
          ))}
        </select>

        {applicationError && (
          <p className="mt-2 text-sm text-red-600">{applicationError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="report-recommendation"
          className="block text-sm font-medium text-black"
        >
          Recommendation
        </label>

        <select
          id="report-recommendation"
          value={recommendation}
          onChange={(event) =>
            setRecommendation(event.target.value as Recommendation)
          }
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            outline-none
            transition
            focus:border-black
          "
        >
          <option value="">Select Recommendation</option>
          <option value="STRONG_HIRE">Strong Hire</option>
          <option value="HIRE">Hire</option>
          <option value="NO_HIRE">No Hire</option>
          <option value="STRONG_NO_HIRE">Strong No Hire</option>
        </select>

        {recommendationError && (
          <p className="mt-2 text-sm text-red-600">{recommendationError}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="report-notes"
          className="block text-sm font-medium text-black"
        >
          Notes
        </label>

        <textarea
          id="report-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={5}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            outline-none
            transition
            focus:border-black
          "
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-5
            py-3
            font-medium
            text-black
            transition
            hover:bg-zinc-100
          "
        >
          Cancel
        </button>

        <button
          type="submit"
          className="
            rounded-lg
            bg-black
            px-5
            py-3
            font-medium
            text-white
            transition
            hover:bg-zinc-800
          "
        >
          {initialValues ? "Save Changes" : "Create Report"}
        </button>
      </div>
    </form>
  );
}
