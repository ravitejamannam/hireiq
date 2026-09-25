export const MATCHER_V2_NOT_FOUND = "MATCHER_V2_NOT_FOUND";
export const MATCHER_V2_IN_PROGRESS = "MATCHER_V2_IN_PROGRESS";
export const MATCHER_V2_INTERNAL_ERROR = "MATCHER_V2_INTERNAL_ERROR";
export const MATCHER_V2_NO_JOB_INTEL = "MATCHER_V2_NO_JOB_INTEL";
export const MATCHER_V2_GENERIC_ERROR = "Unable to assess requirements.";

export class MatcherV2Error extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "MatcherV2Error";
    this.code = code;
  }
}
