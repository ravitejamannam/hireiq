import { extractJobRequirements } from "@/lib/jobs/intelligence/job-intelligence-extractor";
import {
  RETRIEVAL_BENCHMARK_CASES,
  RETRIEVAL_BENCHMARK_DATASET_LABEL,
} from "@/lib/evaluation/retrieval-benchmark-dataset";
import { rankLexicalApplications } from "@/lib/retrieval/lexical-engine";
import { buildLexicalQuery } from "@/lib/retrieval/lexical-query";
import {
  meanReciprocalRank,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  relevantIdsFromJudgments,
} from "@/lib/retrieval/lexical-retrieval-eval";
import type { LexicalApplicationDocument } from "@/lib/retrieval/lexical-retrieval-types";
import { LEXICAL_RETRIEVAL_VERSION } from "@/lib/retrieval/lexical-retrieval-versions";
import { createOfflineHashProjectionEmbedder } from "@/lib/retrieval/semantic-embedder";
import { rankSemanticApplications } from "@/lib/retrieval/semantic-engine";
import { buildSemanticJobQueryText, redactRetrievalText } from "@/lib/retrieval/semantic-representation";
import type {
  RetrievalComparisonReport,
  RetrievalMetricRow,
} from "@/lib/retrieval/semantic-retrieval-types";
import {
  SEMANTIC_RETRIEVAL_VERSION,
} from "@/lib/retrieval/semantic-retrieval-versions";

const K_VALUES = [10, 25, 50, 100];

function toDocuments(
  applications: Array<{
    applicationId: number;
    candidateId: number;
    companyId: number;
    jobId: number;
    text: string;
    revoked?: boolean;
    superseded?: boolean;
  }>,
): LexicalApplicationDocument[] {
  return applications.map((application) => ({
    applicationId: application.applicationId,
    candidateId: application.candidateId,
    companyId: application.companyId,
    jobId: application.jobId,
    evidence: [
      {
        evidenceId: application.applicationId * 10,
        applicationId: application.applicationId,
        candidateId: application.candidateId,
        companyId: application.companyId,
        inlineText: application.text,
        contentSha256: "hash",
        revokedAt: application.revoked ? new Date() : null,
        supersededById: application.superseded ? 99 : null,
      },
    ],
  }));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function metricsFor(
  relevant: number[],
  retrieved: number[],
): RetrievalMetricRow[] {
  return K_VALUES.map((k) => ({
    k,
    recall: recallAtK(relevant, retrieved, k),
    precision: precisionAtK(relevant, retrieved, k),
    ndcg: ndcgAtK(relevant, retrieved, k),
  }));
}

export async function compareLexicalAndSemanticBaselines(): Promise<RetrievalComparisonReport> {
  const embedder = createOfflineHashProjectionEmbedder();
  const m8Recalls: RetrievalMetricRow[][] = [];
  const m9Recalls: RetrievalMetricRow[][] = [];
  const m8Mrr: number[] = [];
  const m9Mrr: number[] = [];
  const m8Ids: number[] = [];
  const m9Ids: number[] = [];

  for (const testCase of RETRIEVAL_BENCHMARK_CASES) {
    const requirements = extractJobRequirements({
      title: "Benchmark",
      primarySkills: testCase.jobPrimarySkills,
      mustHaveRequirements: null,
      niceToHaveRequirements: null,
      location: null,
      experienceRange: null,
      jobDescription: testCase.jobDescription,
      evaluationCriteria: null,
    });
    const query = buildLexicalQuery(
      requirements.map((row) => ({
        sourceField: row.sourceField,
        sourceText: row.sourceText,
        category: row.category,
        normalizedValue: row.normalizedValue,
        skillCanonicalKey: row.skillCanonicalKey,
      })),
    );
    const documents = toDocuments(testCase.applications);
    const relevant = relevantIdsFromJudgments(testCase.judgments);

    const lexical = rankLexicalApplications({
      query,
      applications: documents,
      limit: 100,
    });
    const queryText = redactRetrievalText(buildSemanticJobQueryText(query));
    const evidenceTexts = documents.flatMap((application) =>
      application.evidence.map((evidence) =>
        redactRetrievalText(evidence.inlineText ?? ""),
      ),
    );
    const embedded = await embedder([queryText, ...evidenceTexts]);
    const queryVector = embedded.vectors[0] ?? [];
    const evidenceVectors = new Map<number, number[]>();
    documents.forEach((application, index) => {
      const evidence = application.evidence[0];
      const vector = embedded.vectors[index + 1];
      if (evidence && vector) {
        evidenceVectors.set(evidence.evidenceId, vector);
      }
    });
    const semantic = rankSemanticApplications({
      queryVector,
      applications: documents,
      evidenceVectors,
      limit: 100,
    });

    const lexicalIds = lexical.map((row) => row.applicationId);
    const semanticIds = semantic.map((row) => row.applicationId);
    m8Ids.push(...lexicalIds);
    m9Ids.push(...semanticIds);
    m8Recalls.push(metricsFor(relevant, lexicalIds));
    m9Recalls.push(metricsFor(relevant, semanticIds));
    m8Mrr.push(meanReciprocalRank(relevant, lexicalIds));
    m9Mrr.push(meanReciprocalRank(relevant, semanticIds));
  }

  return {
    datasetLabel: RETRIEVAL_BENCHMARK_DATASET_LABEL,
    m8: {
      retrievalVersion: LEXICAL_RETRIEVAL_VERSION,
      metrics: K_VALUES.map((k, index) => ({
        k,
        recall: average(m8Recalls.map((rows) => rows[index]?.recall ?? 0)),
        precision: average(m8Recalls.map((rows) => rows[index]?.precision ?? 0)),
        ndcg: average(m8Recalls.map((rows) => rows[index]?.ndcg ?? 0)),
      })),
      mrr: average(m8Mrr),
      retrievedIds: m8Ids,
    },
    m9: {
      retrievalVersion: SEMANTIC_RETRIEVAL_VERSION,
      embedderLabel: `${embeddedLabel()}`,
      metrics: K_VALUES.map((k, index) => ({
        k,
        recall: average(m9Recalls.map((rows) => rows[index]?.recall ?? 0)),
        precision: average(m9Recalls.map((rows) => rows[index]?.precision ?? 0)),
        ndcg: average(m9Recalls.map((rows) => rows[index]?.ndcg ?? 0)),
      })),
      mrr: average(m9Mrr),
      retrievedIds: m9Ids,
    },
    notes: [
      "Labels are SYNTHETIC_NOT_RECRUITER_OUTCOMES.",
      "Offline comparison uses hash-projection-v1, not a production embedding model.",
      "A higher M9 number here is not proof that OpenAI embeddings are better.",
      "M9 must not change Matcher V2 or the skill ontology.",
    ],
  };
}

function embeddedLabel() {
  return "offline:hash-projection-v1";
}
