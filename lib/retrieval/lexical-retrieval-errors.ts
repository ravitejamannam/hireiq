export const LEXICAL_RETRIEVAL_NOT_FOUND = "LEXICAL_RETRIEVAL_NOT_FOUND";
export const LEXICAL_RETRIEVAL_IN_PROGRESS = "LEXICAL_RETRIEVAL_IN_PROGRESS";
export const LEXICAL_RETRIEVAL_INTERNAL_ERROR = "LEXICAL_RETRIEVAL_INTERNAL_ERROR";
export const LEXICAL_RETRIEVAL_SPEC_NOT_PUBLISHED =
  "LEXICAL_RETRIEVAL_SPEC_NOT_PUBLISHED";
export const LEXICAL_RETRIEVAL_SPEC_JOB_MISMATCH =
  "LEXICAL_RETRIEVAL_SPEC_JOB_MISMATCH";
export const LEXICAL_RETRIEVAL_GENERIC_ERROR = "Unable to run lexical retrieval.";

export class LexicalRetrievalError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "LexicalRetrievalError";
    this.code = code;
  }
}
