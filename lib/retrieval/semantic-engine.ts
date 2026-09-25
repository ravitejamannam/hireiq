import {
  assembleLexicalCorpus,
  evidenceBelongsToApplication,
  isEligibleRetrievalEvidence,
} from "@/lib/retrieval/lexical-engine";
import type {
  LexicalApplicationDocument,
  LexicalEvidenceDocument,
} from "@/lib/retrieval/lexical-retrieval-types";
import { cosineSimilarity } from "@/lib/retrieval/semantic-cosine";
import type { SemanticApplicationScore } from "@/lib/retrieval/semantic-retrieval-types";

export { assembleLexicalCorpus, isEligibleRetrievalEvidence };

export function scoreSemanticApplication(input: {
  queryVector: number[];
  application: LexicalApplicationDocument;
  evidenceVectors: Map<number, number[]>;
}): SemanticApplicationScore {
  let best: SemanticApplicationScore = {
    applicationId: input.application.applicationId,
    candidateId: input.application.candidateId,
    companyId: input.application.companyId,
    semanticScore: Number.NEGATIVE_INFINITY,
    supportingEvidenceId: null,
  };

  for (const evidence of input.application.evidence) {
    if (
      evidence.companyId !== input.application.companyId ||
      evidence.candidateId !== input.application.candidateId ||
      !isEligibleRetrievalEvidence(evidence) ||
      !evidenceBelongsToApplication(evidence, input.application.applicationId)
    ) {
      continue;
    }
    const vector = input.evidenceVectors.get(evidence.evidenceId);
    if (!vector) {
      continue;
    }
    const score = cosineSimilarity(input.queryVector, vector);
    if (score > best.semanticScore) {
      best = {
        ...best,
        semanticScore: score,
        supportingEvidenceId: evidence.evidenceId,
      };
    }
  }

  return best;
}

export function rankSemanticApplications(input: {
  queryVector: number[];
  applications: LexicalApplicationDocument[];
  evidenceVectors: Map<number, number[]>;
  limit: number;
}): SemanticApplicationScore[] {
  return input.applications
    .filter((application) => application.companyId > 0)
    .map((application) =>
      scoreSemanticApplication({
        queryVector: input.queryVector,
        application,
        evidenceVectors: input.evidenceVectors,
      }),
    )
    .filter((row) => row.supportingEvidenceId != null)
    .sort((left, right) => {
      if (right.semanticScore !== left.semanticScore) {
        return right.semanticScore - left.semanticScore;
      }
      return left.applicationId - right.applicationId;
    })
    .slice(0, input.limit);
}

export function explainSemanticRetrieval(score: SemanticApplicationScore) {
  if (score.supportingEvidenceId == null) {
    return "Not retrieved. No eligible evidence embedding was available.";
  }
  return `Retrieved because eligible evidence #${score.supportingEvidenceId} had semantic similarity ${score.semanticScore.toFixed(3)}. This is similarity, not candidate quality or skill equivalence.`;
}

export function collectEligibleEvidence(
  applications: LexicalApplicationDocument[],
): LexicalEvidenceDocument[] {
  const seen = new Set<number>();
  const rows: LexicalEvidenceDocument[] = [];
  for (const application of applications) {
    for (const evidence of application.evidence) {
      if (
        seen.has(evidence.evidenceId) ||
        evidence.companyId !== application.companyId ||
        !isEligibleRetrievalEvidence(evidence) ||
        !evidenceBelongsToApplication(evidence, application.applicationId)
      ) {
        continue;
      }
      seen.add(evidence.evidenceId);
      rows.push(evidence);
    }
  }
  return rows;
}
