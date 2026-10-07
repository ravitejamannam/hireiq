export const HYBRID_RETRIEVAL_NOT_FOUND = "HYBRID_RETRIEVAL_NOT_FOUND";
export const HYBRID_RETRIEVAL_IN_PROGRESS = "HYBRID_RETRIEVAL_IN_PROGRESS";
export const HYBRID_RETRIEVAL_INTERNAL_ERROR = "HYBRID_RETRIEVAL_INTERNAL_ERROR";
export const HYBRID_RETRIEVAL_BASELINE_INCOMPATIBLE =
  "HYBRID_RETRIEVAL_BASELINE_INCOMPATIBLE";
export const HYBRID_RETRIEVAL_GENERIC_ERROR = "Unable to run hybrid retrieval.";

export class HybridRetrievalError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "HybridRetrievalError";
    this.code = code;
  }
}
