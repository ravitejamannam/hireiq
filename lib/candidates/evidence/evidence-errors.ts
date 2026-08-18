export class CandidateEvidenceError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CandidateEvidenceError";
    this.code = code;
  }
}

export const EVIDENCE_NOT_FOUND = "EVIDENCE_NOT_FOUND";
export const EVIDENCE_TENANT_MISMATCH = "EVIDENCE_TENANT_MISMATCH";
export const EVIDENCE_APPLICATION_MISMATCH = "EVIDENCE_APPLICATION_MISMATCH";
export const EVIDENCE_IMMUTABLE = "EVIDENCE_IMMUTABLE";
export const EVIDENCE_ALREADY_SUPERSEDED = "EVIDENCE_ALREADY_SUPERSEDED";
export const EVIDENCE_UNCHANGED_REPLACEMENT = "EVIDENCE_UNCHANGED_REPLACEMENT";
