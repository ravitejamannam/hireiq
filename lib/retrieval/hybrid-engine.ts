import { HYBRID_FUSION_VERSION, HYBRID_RRF_K } from "@/lib/retrieval/hybrid-retrieval-versions";

export type HybridBaselineHit = {
  applicationId: number;
  candidateId: number;
  companyId: number;
  rank: number;
};

export type HybridFusionRow = {
  applicationId: number;
  candidateId: number;
  companyId: number;
  lexicalRank: number | null;
  semanticRank: number | null;
  rrfScore: number;
  fusionVersion: string;
};

export function reciprocalRankContribution(rank: number, k = HYBRID_RRF_K) {
  return 1 / (k + rank);
}

export function fuseReciprocalRank(input: {
  lexical: HybridBaselineHit[];
  semantic: HybridBaselineHit[];
  limit: number;
  companyId: number;
}): HybridFusionRow[] {
  const byApplication = new Map<number, HybridFusionRow>();

  function add(hit: HybridBaselineHit, source: "lexical" | "semantic") {
    if (hit.companyId !== input.companyId) {
      throw new Error("Baseline row is outside the job company.");
    }
    const current = byApplication.get(hit.applicationId);
    if (!current) {
      byApplication.set(hit.applicationId, {
        applicationId: hit.applicationId,
        candidateId: hit.candidateId,
        companyId: hit.companyId,
        lexicalRank: source === "lexical" ? hit.rank : null,
        semanticRank: source === "semantic" ? hit.rank : null,
        rrfScore: reciprocalRankContribution(hit.rank),
        fusionVersion: HYBRID_FUSION_VERSION,
      });
      return;
    }
    if (current.candidateId !== hit.candidateId) {
      throw new Error("Baseline rows disagree on candidate identity.");
    }
    if (source === "lexical") {
      if (current.lexicalRank != null) {
        throw new Error("Lexical baseline listed an application twice.");
      }
      current.lexicalRank = hit.rank;
    } else {
      if (current.semanticRank != null) {
        throw new Error("Semantic baseline listed an application twice.");
      }
      current.semanticRank = hit.rank;
    }
    current.rrfScore += reciprocalRankContribution(hit.rank);
  }

  for (const hit of input.lexical) {
    add(hit, "lexical");
  }
  for (const hit of input.semantic) {
    add(hit, "semantic");
  }

  return [...byApplication.values()]
    .sort((left, right) => {
      if (right.rrfScore !== left.rrfScore) {
        return right.rrfScore - left.rrfScore;
      }
      return left.applicationId - right.applicationId;
    })
    .slice(0, input.limit);
}

export function explainHybridRetrieval(row: HybridFusionRow) {
  const lexical =
    row.lexicalRank == null
      ? "M8 did not retrieve it"
      : `M8 rank ${row.lexicalRank}`;
  const semantic =
    row.semanticRank == null
      ? "M9 did not retrieve it"
      : `M9 rank ${row.semanticRank}`;
  return `${lexical}. ${semantic}. RRF score ${row.rrfScore} is retrieval fusion, not candidate quality or a hiring recommendation.`;
}

export type HybridRunDisposition = "reuse" | "refuse" | "recover" | "create";

export function resolveHybridRunDisposition(input: {
  completedExists: boolean;
  runningAgeMs: number | null;
  staleMs: number;
}): HybridRunDisposition {
  if (input.completedExists) {
    return "reuse";
  }
  if (input.runningAgeMs == null) {
    return "create";
  }
  if (input.runningAgeMs < input.staleMs) {
    return "refuse";
  }
  return "recover";
}
