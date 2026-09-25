export const EVIDENCE_GRAPH_NOT_FOUND = "EVIDENCE_GRAPH_NOT_FOUND";
export const EVIDENCE_GRAPH_IN_PROGRESS = "EVIDENCE_GRAPH_IN_PROGRESS";
export const EVIDENCE_GRAPH_INTERNAL_ERROR = "EVIDENCE_GRAPH_INTERNAL_ERROR";
export const EVIDENCE_GRAPH_TENANT_MISMATCH = "EVIDENCE_GRAPH_TENANT_MISMATCH";
export const EVIDENCE_GRAPH_GENERIC_ERROR = "Unable to materialize evidence graph.";

export class EvidenceGraphError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "EvidenceGraphError";
    this.code = code;
  }
}
