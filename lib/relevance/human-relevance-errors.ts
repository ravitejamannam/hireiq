export const HUMAN_RELEVANCE_NOT_FOUND = "HUMAN_RELEVANCE_NOT_FOUND";
export const HUMAN_RELEVANCE_FORBIDDEN = "HUMAN_RELEVANCE_FORBIDDEN";
export const HUMAN_RELEVANCE_INVALID = "HUMAN_RELEVANCE_INVALID";
export const HUMAN_RELEVANCE_NO_EVIDENCE = "HUMAN_RELEVANCE_NO_EVIDENCE";
export const HUMAN_RELEVANCE_ALREADY_SUPERSEDED = "HUMAN_RELEVANCE_ALREADY_SUPERSEDED";

export class HumanRelevanceError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "HumanRelevanceError";
    this.code = code;
  }
}
