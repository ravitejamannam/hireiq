export const INGESTION_NOT_FOUND = "Hosted apply submission was not found.";
export const INGESTION_INVALID = "Hosted apply submission is invalid.";
export const INGESTION_SPEC_NOT_PUBLISHED =
  "Pinned specification is not published.";
export const INGESTION_TENANT_MISMATCH = "Ingestion tenant mismatch.";
export const PROVIDER_INGESTION_UNAVAILABLE =
  "Provider ingestion is not available.";

export class ApplicationIngestionError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ApplicationIngestionError";
    this.code = code;
  }
}
