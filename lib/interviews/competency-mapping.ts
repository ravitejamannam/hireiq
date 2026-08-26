/**
 * T130: interview-notes → competency mapping (BrightHire-lite steal).
 *
 * Deterministic keyword matching — no AI, no black box. Given raw
 * interviewer notes, suggests which rubric competencies the text
 * touches so the interviewer can route evidence to the right rows.
 *
 * Matching strategy:
 *  1. Words from the competency name itself ("System Design" → design)
 *  2. A small curated synonym table per common competency theme
 */

const SYNONYMS: Record<string, string[]> = {
  // technical themes
  architecture: ["architecture", "scalab", "design", "system", "distributed", "microservice", "api"],
  coding: ["code", "coding", "algorithm", "data structure", "complexity", "implementation", "bug"],
  debugging: ["debug", "troubleshoot", "root cause", "incident"],
  testing: ["test", "coverage", "qa", "quality"],
  databases: ["database", "sql", "schema", "query", "index", "nosql"],
  infrastructure: ["infra", "cloud", "aws", "kubernetes", "docker", "deployment", "ci/cd", "devops"],
  performance: ["performance", "latency", "optimi", "throughput", "profiling"],
  security: ["security", "auth", "vulnerab", "encryption"],
  // behavioural themes
  communication: ["communication", "communicat", "clarity", "articulat", "explained", "listening"],
  leadership: ["leadership", "led", "mentor", "coach", "owned", "ownership"],
  collaboration: ["collaborat", "team", "cross-functional", "stakeholder", "pair"],
  ownership: ["ownership", "own", "accountab", "end-to-end", "delivered"],
  problemsolving: ["problem", "solved", "approach", "trade-off", "analytical", "reasoning"],
  culture: ["culture", "values", "humility", "feedback", "growth"],
  planning: ["planning", "prioriti", "deadline", "roadmap", "estimat"],
};

function tokensForCompetency(name: string): string[] {
  const words = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4);
  return words;
}

export type CompetencySuggestion = {
  name: string;
  matchedOn: string[];
};

/**
 * Suggest competencies mentioned in free-text notes.
 * Returns only competencies with at least one match, best first.
 */
export function suggestCompetencies(
  noteText: string,
  competencyNames: string[],
): CompetencySuggestion[] {
  const text = noteText.toLowerCase();
  if (!text.trim() || competencyNames.length === 0) return [];

  const scored: Array<CompetencySuggestion & { hits: number }> = [];

  for (const name of competencyNames) {
    const matchedOn = new Set<string>();

    for (const token of tokensForCompetency(name)) {
      if (text.includes(token)) matchedOn.add(name.split(/\s+/).find((w) => w.toLowerCase().includes(token)) ?? token);
    }

    for (const [theme, keywords] of Object.entries(SYNONYMS)) {
      if (!name.toLowerCase().includes(theme)) continue;
      for (const kw of keywords) {
        if (text.includes(kw)) matchedOn.add(kw);
      }
    }

    if (matchedOn.size > 0) {
      scored.push({ name, matchedOn: [...matchedOn].slice(0, 4), hits: matchedOn.size });
    }
  }

  return scored
    .sort((a, b) => b.hits - a.hits)
    .map(({ name, matchedOn }) => ({ name, matchedOn }));
}
