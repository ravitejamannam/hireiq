import type {
  RetrievalRelevanceLabel,
  SyntheticRetrievalJudgment,
} from "@/lib/retrieval/lexical-retrieval-types";

const RELEVANT_LABELS = new Set<RetrievalRelevanceLabel>([
  "RELEVANT",
  "STRONGLY_RELEVANT",
]);

export function recallAtK(
  relevantApplicationIds: number[],
  retrievedApplicationIds: number[],
  k: number,
) {
  if (relevantApplicationIds.length === 0) {
    return 0;
  }
  const top = new Set(retrievedApplicationIds.slice(0, k));
  const hits = relevantApplicationIds.filter((id) => top.has(id)).length;
  return hits / relevantApplicationIds.length;
}

export function relevantIdsFromJudgments(judgments: SyntheticRetrievalJudgment[]) {
  return judgments
    .filter((row) => RELEVANT_LABELS.has(row.label))
    .map((row) => row.applicationId);
}

export function precisionAtK(
  relevantApplicationIds: number[],
  retrievedApplicationIds: number[],
  k: number,
) {
  const top = retrievedApplicationIds.slice(0, k);
  if (top.length === 0) {
    return 0;
  }
  const relevant = new Set(relevantApplicationIds);
  return top.filter((id) => relevant.has(id)).length / top.length;
}

export function meanReciprocalRank(
  relevantApplicationIds: number[],
  retrievedApplicationIds: number[],
) {
  const relevant = new Set(relevantApplicationIds);
  const index = retrievedApplicationIds.findIndex((id) => relevant.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export function ndcgAtK(
  relevantApplicationIds: number[],
  retrievedApplicationIds: number[],
  k: number,
) {
  const relevant = new Set(relevantApplicationIds);
  const top = retrievedApplicationIds.slice(0, k);
  const dcg = top.reduce((sum, id, index) => {
    return relevant.has(id) ? sum + 1 / Math.log2(index + 2) : sum;
  }, 0);
  const idealCount = Math.min(relevant.size, k);
  const idcg = Array.from({ length: idealCount }, (_, index) => 1 / Math.log2(index + 2)).reduce(
    (sum, value) => sum + value,
    0,
  );
  return idcg === 0 ? 0 : dcg / idcg;
}
