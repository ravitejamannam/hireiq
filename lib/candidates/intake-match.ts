import type { KnownCandidate } from "@/lib/imports/import-preview";

export type IntakeSuggestion = {
  candidateId: number;
  name: string;
  reason: string;
};

export type IntakeMatchDecision =
  | { decision: "create"; suggestions: IntakeSuggestion[] }
  | { decision: "attach"; candidateId: number; name: string; suggestions: IntakeSuggestion[] }
  | { decision: "review"; candidateIds: number[]; suggestions: IntakeSuggestion[] }
  | { decision: "erased"; suggestions: IntakeSuggestion[] };

/**
 * Same rules for hosted apply, CSV import, and inbound email.
 * One exact email attaches. Several exact emails need a person to choose.
 * Phone digits and name-plus-employer are suggestions only.
 * Candidates from another company are ignored.
 */
export function decideIntakeMatch(input: {
  companyId: number;
  email: string | null;
  phoneDigits: string | null;
  name: string | null;
  employer: string | null;
  known: KnownCandidate[];
}): IntakeMatchDecision {
  const known = input.known.filter((candidate) => candidate.companyId === input.companyId);
  const email = input.email?.trim().toLowerCase() || null;
  const liveEmail = email
    ? known.filter((candidate) => candidate.email === email && !candidate.erased)
    : [];
  const erased = Boolean(email && known.some((candidate) => candidate.email === email && candidate.erased));
  const suggestions = suggestionsFor(known, {
    emailMatchCount: liveEmail.length,
    phoneDigits: input.phoneDigits,
    name: input.name,
    employer: input.employer,
  });

  if (liveEmail.length > 1) {
    return { decision: "review", candidateIds: liveEmail.map((candidate) => candidate.candidateId), suggestions };
  }
  if (liveEmail.length === 1) {
    const match = liveEmail[0]!;
    return { decision: "attach", candidateId: match.candidateId, name: match.name, suggestions };
  }
  if (erased) return { decision: "erased", suggestions };
  return { decision: "create", suggestions };
}

function suggestionsFor(
  known: KnownCandidate[],
  input: {
    emailMatchCount: number;
    phoneDigits: string | null;
    name: string | null;
    employer: string | null;
  },
): IntakeSuggestion[] {
  if (input.emailMatchCount === 1) return [];
  const suggestions: IntakeSuggestion[] = [];
  const name = input.name?.trim().toLowerCase() ?? "";
  const employer = input.employer?.trim().toLowerCase() ?? "";
  for (const candidate of known) {
    if (candidate.erased) continue;
    if (input.phoneDigits && candidate.phoneDigits === input.phoneDigits) {
      suggestions.push({
        candidateId: candidate.candidateId,
        name: candidate.name,
        reason: "Same phone digits. Confirm before using this person.",
      });
      continue;
    }
    const sameName = name.length >= 2 && candidate.name.trim().toLowerCase() === name;
    const sameEmployer = Boolean(
      employer && candidate.currentEmployer && candidate.currentEmployer.trim().toLowerCase() === employer,
    );
    if (sameName && sameEmployer) {
      suggestions.push({
        candidateId: candidate.candidateId,
        name: candidate.name,
        reason: "Same name and employer. This is a suggestion, not a match.",
      });
    }
  }
  return suggestions.slice(0, 3);
}
