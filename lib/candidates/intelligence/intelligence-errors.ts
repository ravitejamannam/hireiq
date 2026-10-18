export class CandidateIntelligenceError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CandidateIntelligenceError";
    this.code = code;
  }
}

export const INTELLIGENCE_NOT_FOUND = "EVIDENCE_NOT_FOUND";
export const INTELLIGENCE_EVIDENCE_REVOKED = "EVIDENCE_REVOKED";
export const INTELLIGENCE_EVIDENCE_SUPERSEDED = "EVIDENCE_SUPERSEDED";
export const INTELLIGENCE_AI_NOT_CONFIGURED = "AI_NOT_CONFIGURED";
export const INTELLIGENCE_AI_TIMEOUT = "AI_TIMEOUT";
export const INTELLIGENCE_AI_PROVIDER_ERROR = "AI_PROVIDER_ERROR";
export const INTELLIGENCE_AI_INVALID_OUTPUT = "AI_INVALID_OUTPUT";
export const INTELLIGENCE_AI_RATE_LIMITED = "AI_RATE_LIMITED";
export const INTELLIGENCE_AI_IN_PROGRESS = "AI_IN_PROGRESS";
export const INTELLIGENCE_AI_OPT_OUT = "AI_EVALUATION_OPT_OUT";
export const INTELLIGENCE_INTERNAL_ERROR = "INTERNAL_ERROR";

export const INTELLIGENCE_UNCHANGED_ERROR =
  "We couldn't generate candidate intelligence right now.";
