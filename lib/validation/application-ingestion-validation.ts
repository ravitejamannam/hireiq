import { ApplicationIngestionError } from "@/lib/ingestion/ingestion-errors";
import { canTransitionIngestion } from "@/lib/ingestion/state-machine";
import { ApplicationIngestionStatus } from "@prisma/client";

export function validateIngestionSubmissionId(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new ApplicationIngestionError(
      "Submission ID must be a positive integer.",
      "INVALID_SUBMISSION_ID",
    );
  }

  return value;
}

export function assertIngestionTransition(
  from: ApplicationIngestionStatus,
  to: ApplicationIngestionStatus,
) {
  if (!canTransitionIngestion(from, to)) {
    throw new ApplicationIngestionError(
      "Invalid ingestion status transition.",
      "INVALID_TRANSITION",
    );
  }
}
