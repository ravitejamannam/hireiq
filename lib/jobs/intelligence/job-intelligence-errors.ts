export const JOB_INTELLIGENCE_NOT_FOUND = "JOB_INTELLIGENCE_NOT_FOUND";
export const JOB_INTELLIGENCE_SPEC_NOT_FOUND = "JOB_INTELLIGENCE_SPEC_NOT_FOUND";
export const JOB_INTELLIGENCE_SPEC_NOT_PUBLISHED =
  "JOB_INTELLIGENCE_SPEC_NOT_PUBLISHED";
export const JOB_INTELLIGENCE_SPEC_JOB_MISMATCH =
  "JOB_INTELLIGENCE_SPEC_JOB_MISMATCH";
export const JOB_INTELLIGENCE_IN_PROGRESS = "JOB_INTELLIGENCE_IN_PROGRESS";
export const JOB_INTELLIGENCE_INTERNAL_ERROR = "JOB_INTELLIGENCE_INTERNAL_ERROR";
export const JOB_INTELLIGENCE_GENERIC_ERROR =
  "Unable to extract job intelligence.";

export class JobIntelligenceError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "JobIntelligenceError";
    this.code = code;
  }
}
