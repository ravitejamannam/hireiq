export class CandidateMatchingError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CandidateMatchingError";
    this.code = code;
  }
}

export const MATCHING_NOT_FOUND = "APPLICATION_NOT_FOUND";
export const MATCHING_SPEC_NOT_FOUND = "SPECIFICATION_NOT_FOUND";
export const MATCHING_SPEC_NOT_PUBLISHED = "SPECIFICATION_NOT_PUBLISHED";
export const MATCHING_SPEC_JOB_MISMATCH = "SPECIFICATION_JOB_MISMATCH";
export const MATCHING_IN_PROGRESS = "MATCHING_IN_PROGRESS";
export const MATCHING_INTERNAL_ERROR = "INTERNAL_ERROR";

export const MATCHING_GENERIC_ERROR =
  "We couldn't run candidate matching right now.";
