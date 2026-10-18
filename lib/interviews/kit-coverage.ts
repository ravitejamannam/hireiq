export type CoverageItem = {
  id: number;
  requirementType: "REQUIRED" | "PREFERRED";
  coveredBy: Array<"INTERVIEW" | "ASSESSMENT" | "RESUME">;
};

export function coverageGaps(items: CoverageItem[]) {
  return items
    .filter((item) => item.requirementType === "REQUIRED" && item.coveredBy.length === 0)
    .map((item) => ({
      requirementId: item.id,
      warning: "Required item is not on a stage or an assessment.",
    }));
}

const PROHIBITED = /\b(age|religion|pregnancy|disability|marital|national origin|race)\b/i;

export function questionAllowed(text: string) {
  return !PROHIBITED.test(text);
}

export function nearDuplicate(candidate: string, existing: string[]) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const next = normalize(candidate);
  return existing.some((row) => normalize(row) === next);
}

export function scorecardsVisible(input: {
  viewerSubmitted: boolean;
  cards: Array<{ interviewerId: number; submitted: boolean }>;
  viewerId: number;
}) {
  if (input.viewerSubmitted) return input.cards;
  return input.cards.filter((card) => card.interviewerId === input.viewerId);
}

export function notesToEvidenceDraft(notes: string) {
  return {
    evidenceText: notes.trim(),
    rating: null,
    recommendation: null,
  };
}

export function debrief(input: {
  requirements: Array<{ id: number }>;
  scorecards: Array<{ interviewerId: number; ratings: Record<number, number>; evidence: number[] }>;
}) {
  const agreements: number[] = [];
  const disagreements: number[] = [];
  for (const requirement of input.requirements) {
    const ratings = input.scorecards
      .map((card) => card.ratings[requirement.id])
      .filter((value) => value !== undefined);
    if (ratings.length < 2) continue;
    const unique = new Set(ratings);
    if (unique.size === 1) agreements.push(requirement.id);
    else disagreements.push(requirement.id);
  }
  const evidenced = new Set(input.scorecards.flatMap((card) => card.evidence));
  const missingEvidence = input.requirements
    .map((row) => row.id)
    .filter((id) => !evidenced.has(id));
  return { agreements, disagreements, missingEvidence };
}
