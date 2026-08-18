export class CandidateRankingError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CandidateRankingError";
    this.code = code;
  }
}

export const RANKING_NOT_FOUND = "JOB_NOT_FOUND";
export const RANKING_SPEC_NOT_FOUND = "SPECIFICATION_NOT_FOUND";
export const RANKING_SPEC_NOT_PUBLISHED = "SPECIFICATION_NOT_PUBLISHED";
export const RANKING_SPEC_JOB_MISMATCH = "SPECIFICATION_JOB_MISMATCH";
export const RANKING_IN_PROGRESS = "RANKING_IN_PROGRESS";
export const RANKING_NO_MATCH_RUNS = "NO_MATCH_RUNS";
export const RANKING_INTERNAL_ERROR = "INTERNAL_ERROR";

export const RANKING_GENERIC_ERROR =
  "We couldn't run evidence coverage ranking right now.";
