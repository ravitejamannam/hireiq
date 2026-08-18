import { ApplicationIngestionStatus } from "@prisma/client";

export const INGESTION_TRANSITIONS: Record<
  ApplicationIngestionStatus,
  readonly ApplicationIngestionStatus[]
> = {
  RECEIVED: ["PROCESSING"],
  PROCESSING: ["PROCESSED", "FAILED"],
  PROCESSED: [],
  FAILED: ["PROCESSING"],
};

export function canTransitionIngestion(
  from: ApplicationIngestionStatus,
  to: ApplicationIngestionStatus,
) {
  return INGESTION_TRANSITIONS[from].includes(to);
}
