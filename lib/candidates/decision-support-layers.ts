export const LAYER_MATCHER_V1 = "MATCHER_V1_COVERAGE";
export const LAYER_MATCHER_V2 = "MATCHER_V2_ASSESSMENT";
export const LAYER_T94_RANKING = "T94_EVIDENCE_COVERAGE_RANKING";
export const LAYER_M8_LEXICAL = "M8_LEXICAL_RETRIEVAL";
export const LAYER_M9_SEMANTIC = "M9_SEMANTIC_RETRIEVAL";

export function matcherV1CoverageLabel(jobTitle: string) {
  return `Matcher V1 evidence coverage — ${jobTitle}`;
}

export function matcherV1CoverageDetail(satisfied: number) {
  return `${satisfied} SATISFIED requirement rows`;
}

export function matcherV1CoverageMeta(unknown: number, total: number) {
  return `UNKNOWN is missing evidence, not a fail · ${total} V1 requirement rows · not lexical retrieval, not semantic retrieval, not Matcher V2`;
}

export function matcherV2Label(jobTitle: string) {
  return `Matcher V2 requirement assessment — ${jobTitle}`;
}

export function matcherV2Detail(supported: number, contradicted: number) {
  return `${supported} SUPPORTED · ${contradicted} CONTRADICTED`;
}

export function matcherV2Meta(unknown: number) {
  return `${unknown} UNKNOWN · not a T94 rank, not M8/M9 retrieval, not candidate quality`;
}

export function t94RankingLabel(jobTitle: string) {
  return `T94 evidence-coverage ranking — ${jobTitle}`;
}

export function t94RankingDetail(rank: number | null, satisfiedSkillCount: number | null) {
  if (rank == null || satisfiedSkillCount == null) {
    return "Unranked — no completed V1 match run";
  }
  return `coverage rank #${rank} · ${satisfiedSkillCount} satisfied primary skills`;
}

export function t94RankingMeta() {
  return "T94 coverage ordering only · not Matcher V2 · not M8 lexical retrieval · not M9 semantic retrieval · not candidate quality";
}

export function lexicalRetrievalLabel(jobTitle: string) {
  return `M8 lexical retrieval — ${jobTitle}`;
}

export function lexicalRetrievalDetail(rank: number, lexicalScore: number) {
  return `retrieved rank #${rank} · lexical overlap ${lexicalScore}`;
}

export function lexicalRetrievalMeta(matchedTerms: string[]) {
  return `v1-lexical-term-overlap · ${matchedTerms.join(", ") || "no terms"} · not a hire score`;
}

export function semanticRetrievalLabel(jobTitle: string) {
  return `M9 semantic retrieval — ${jobTitle}`;
}

export function semanticRetrievalDetail(rank: number, semanticScore: number) {
  return `retrieved rank #${rank} · semantic similarity ${semanticScore.toFixed(3)}`;
}

export function semanticRetrievalMeta(evidenceId: number | null) {
  return `v1-semantic-embedding · supporting evidence ${evidenceId ?? "none"} · similarity is not skill equivalence`;
}
