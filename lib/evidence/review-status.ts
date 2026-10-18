export type ReviewStatus = "MEETS" | "NOT_MET" | "UNKNOWN";

export function citationIsVerbatim(source: string, quote: string | null | undefined) {
  if (!quote || !quote.trim()) return false;
  return source.includes(quote);
}

/** MEETS is stored only when the quote exists verbatim in the source. */
export function gateMeets(input: {
  proposed: ReviewStatus;
  source: string;
  quote: string | null;
}): ReviewStatus {
  if (input.proposed !== "MEETS") return input.proposed;
  return citationIsVerbatim(input.source, input.quote) ? "MEETS" : "UNKNOWN";
}

export function applyOverride(input: {
  status: ReviewStatus;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("An override needs a reason.");
  return { status: input.status, overrideReason: reason };
}

export function overrideRate(rows: Array<{ overridden: boolean }>) {
  if (rows.length === 0) return 0;
  return rows.filter((row) => row.overridden).length / rows.length;
}

export function evidenceVisible(input: {
  companyEnabled: boolean;
  jobEnabled: boolean;
  candidateOptedOut: boolean;
}) {
  return input.companyEnabled && input.jobEnabled && !input.candidateOptedOut;
}

/** Ranking coverage must not write Application.status. */
export function rankingMayChangeApplicationStatus() {
  return false;
}
