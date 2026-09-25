import {
  RETRIEVAL_BENCHMARK_CASES,
  RETRIEVAL_BENCHMARK_DATASET_LABEL,
  RETRIEVAL_BENCHMARK_DATASET_VERSION,
  type RetrievalBenchmarkCase,
} from "@/lib/evaluation/retrieval-benchmark-dataset";
import { extractJobRequirements } from "@/lib/jobs/intelligence/job-intelligence-extractor";
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
import {
  embedLiveProductionTexts,
  isLiveOpenAiEmbeddingConfigured,
  type EmbeddingBatchResult,
  type SemanticEmbedder,
} from "@/lib/retrieval/semantic-embedder";
import { rankSemanticApplications } from "@/lib/retrieval/semantic-engine";
import {
  buildSemanticJobQueryText,
  redactRetrievalText,
} from "@/lib/retrieval/semantic-representation";
import {
  SEMANTIC_EMBEDDING_INVALID,
  SEMANTIC_EMBEDDING_PROVIDER_ERROR,
  SemanticRetrievalError,
} from "@/lib/retrieval/semantic-retrieval-errors";
import type { RetrievalMetricRow } from "@/lib/retrieval/semantic-retrieval-types";
import {
  DEFAULT_OPENAI_EMBEDDING_DIMENSIONS,
  DEFAULT_OPENAI_EMBEDDING_MODEL,
  DEFAULT_OPENAI_EMBEDDING_VERSION,
  SEMANTIC_QUERY_CONSTRUCTION_VERSION,
  SEMANTIC_REPRESENTATION_VERSION,
  SEMANTIC_RETRIEVAL_VERSION,
} from "@/lib/retrieval/semantic-retrieval-versions";

export const LIVE_PRODUCTION_EMBEDDING_NOT_RUN =
  "LIVE_PRODUCTION_EMBEDDING_NOT_RUN";

export const LIVE_EMBEDDING_EVALUATION_K = [10, 25, 50, 100] as const;
export const LIVE_EMBEDDING_RESULT_LIMIT = 100;

export type LiveEmbeddingEvaluationStatus = "NOT_RUN" | "PARTIAL" | "COMPLETED";

export type LiveEmbeddingCaseResult = {
  caseId: string;
  relevantIds: number[];
  m8RetrievedIds: number[];
  m9RetrievedIds: number[];
  m9Scores: Array<{ applicationId: number; semanticScore: number }>;
  recoveredByM9: number[];
  introducedByM9: number[];
  missedByM9: number[];
};

export type LiveEmbeddingDiagnosticProbe = {
  id: string;
  inspectedFailureMode: string;
  inOfficialBenchmark: false;
  jobPrimarySkills: string;
  evidenceText: string;
  lexicalRetrieved: boolean;
  semanticRetrieved: boolean;
  semanticScore: number | null;
};

export type LiveEmbeddingEvaluationReport = {
  status: LiveEmbeddingEvaluationStatus;
  statusCode: string | null;
  datasetLabel: typeof RETRIEVAL_BENCHMARK_DATASET_LABEL;
  datasetVersion: string;
  recordedAt: string;
  provider: string | null;
  model: string | null;
  modelIdentifier: string | null;
  embeddingDimensions: number | null;
  retrievalVersion: string;
  queryConstructionVersion: string;
  representationVersion: string;
  candidateRepresentation: string;
  privacyNote: string;
  m8: {
    retrievalVersion: string;
    metrics: RetrievalMetricRow[];
    mrr: number;
  } | null;
  m9Live: {
    retrievalVersion: string;
    embedderLabel: string;
    metrics: RetrievalMetricRow[];
    mrr: number;
  } | null;
  differences: Array<{
    metric: string;
    m8: number;
    m9Live: number;
    difference: number;
  }> | null;
  cases: LiveEmbeddingCaseResult[];
  similarityScores: number[];
  similaritySummary: {
    count: number;
    min: number;
    max: number;
    mean: number;
    median: number;
  } | null;
  usage: {
    embeddingApiCalls: number;
    retryCount: number;
    promptTokens: number | null;
    totalTokens: number | null;
    textUnitsSent: number;
    estimatedCostUsd: null;
    costNote: string;
    embeddingLatencyMs: number;
    retrievalLatencyMs: number;
    totalRuntimeMs: number;
    providerFailures: number;
    errorCode: string | null;
  };
  diagnostics: {
    label: "DIAGNOSTIC_NOT_IN_BENCHMARK";
    status: LiveEmbeddingEvaluationStatus;
    probes: LiveEmbeddingDiagnosticProbe[];
    notes: string[];
  };
  notes: string[];
  m10DesignGate: {
    sufficientToDesign: boolean;
    rationale: string;
  };
};

const PRIVACY_NOTE =
  "Live embeddings send redacted structured-query and evidence text to OpenAI. Candidate IDs, emails, phones, and company identifiers are not included in the embedding payload. Transmitted evidence is not logged.";

const COST_NOTE =
  "USD cost is not estimated. Provider token counts are recorded when the API returns usage. Pricing is not pinned in this repository.";

type LiveEmbedder = (texts: string[]) => Promise<EmbeddingBatchResult>;

const DIAGNOSTIC_PROBES: Array<{
  id: string;
  inspectedFailureMode: string;
  jobPrimarySkills: string;
  evidenceText: string;
}> = [
  {
    id: "diagnostic-python-vs-django",
    inspectedFailureMode: "Python vs Django",
    jobPrimarySkills: "Python",
    evidenceText: "Built Django admin dashboards only.",
  },
  {
    id: "diagnostic-java-vs-javascript",
    inspectedFailureMode: "Java vs JavaScript",
    jobPrimarySkills: "Java",
    evidenceText: "Shipped JavaScript frontend features.",
  },
  {
    id: "diagnostic-postgres-vs-mysql",
    inspectedFailureMode: "PostgreSQL vs MySQL",
    jobPrimarySkills: "PostgreSQL",
    evidenceText: "Operated MySQL replicas in production.",
  },
  {
    id: "diagnostic-keyword-stuffing",
    inspectedFailureMode: "keyword stuffing",
    jobPrimarySkills: "Python",
    evidenceText: "Python Python Python Python Python Python Python Python",
  },
  {
    id: "diagnostic-verbose-evidence",
    inspectedFailureMode: "verbose evidence",
    jobPrimarySkills: "Python",
    evidenceText:
      "Long-form cover letter about collaboration, mentoring, and delivery culture, with one mention of Python near the end.",
  },
];

function notRunReport(startedAt: number): LiveEmbeddingEvaluationReport {
  return emptyReport({
    status: "NOT_RUN",
    statusCode: LIVE_PRODUCTION_EMBEDDING_NOT_RUN,
    startedAt,
    notes: [
      "LIVE_PRODUCTION_EMBEDDING_NOT_RUN",
      "OPENAI_API_KEY is not configured. The live evaluation did not run.",
      "hash-projection-v1 was not substituted. Offline results are not production evidence.",
    ],
    m10Rationale:
      "No live text-embedding-3-small measurement exists. M10 hybrid design is not justified from this gate.",
  });
}

function emptyReport(input: {
  status: LiveEmbeddingEvaluationStatus;
  statusCode: string | null;
  startedAt: number;
  notes: string[];
  m10Rationale: string;
  usage?: Partial<LiveEmbeddingEvaluationReport["usage"]>;
}): LiveEmbeddingEvaluationReport {
  return {
    status: input.status,
    statusCode: input.statusCode,
    datasetLabel: RETRIEVAL_BENCHMARK_DATASET_LABEL,
    datasetVersion: RETRIEVAL_BENCHMARK_DATASET_VERSION,
    recordedAt: new Date().toISOString(),
    provider: null,
    model: null,
    modelIdentifier: null,
    embeddingDimensions: null,
    retrievalVersion: SEMANTIC_RETRIEVAL_VERSION,
    queryConstructionVersion: SEMANTIC_QUERY_CONSTRUCTION_VERSION,
    representationVersion: SEMANTIC_REPRESENTATION_VERSION,
    candidateRepresentation: "eligible-evidence-text",
    privacyNote: PRIVACY_NOTE,
    m8: null,
    m9Live: null,
    differences: null,
    cases: [],
    similarityScores: [],
    similaritySummary: null,
    usage: {
      embeddingApiCalls: 0,
      retryCount: 0,
      promptTokens: null,
      totalTokens: null,
      textUnitsSent: 0,
      estimatedCostUsd: null,
      costNote: COST_NOTE,
      embeddingLatencyMs: 0,
      retrievalLatencyMs: 0,
      totalRuntimeMs: Date.now() - input.startedAt,
      providerFailures: input.status === "NOT_RUN" ? 0 : 1,
      errorCode: input.statusCode,
      ...input.usage,
    },
    diagnostics: {
      label: "DIAGNOSTIC_NOT_IN_BENCHMARK",
      status: "NOT_RUN",
      probes: [],
      notes: [
        "Diagnostic probes are not part of the official Recall@K table.",
      ],
    },
    notes: input.notes,
    m10DesignGate: {
      sufficientToDesign: false,
      rationale: input.m10Rationale,
    },
  };
}

function toDocuments(
  applications: RetrievalBenchmarkCase["applications"],
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

function buildQuery(testCase: {
  jobPrimarySkills: string;
  jobDescription?: string | null;
}) {
  const requirements = extractJobRequirements({
    title: "Benchmark",
    primarySkills: testCase.jobPrimarySkills,
    mustHaveRequirements: null,
    niceToHaveRequirements: null,
    location: null,
    experienceRange: null,
    jobDescription: testCase.jobDescription ?? null,
    evaluationCriteria: null,
  });
  return buildLexicalQuery(
    requirements.map((row) => ({
      sourceField: row.sourceField,
      sourceText: row.sourceText,
      category: row.category,
      normalizedValue: row.normalizedValue,
      skillCanonicalKey: row.skillCanonicalKey,
    })),
  );
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function metricsFor(relevant: number[], retrieved: number[]): RetrievalMetricRow[] {
  return LIVE_EMBEDDING_EVALUATION_K.map((k) => ({
    k,
    recall: recallAtK(relevant, retrieved, k),
    precision: precisionAtK(relevant, retrieved, k),
    ndcg: ndcgAtK(relevant, retrieved, k),
  }));
}

function summarizeScores(scores: number[]) {
  if (scores.length === 0) {
    return null;
  }
  const sorted = [...scores].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  return {
    count: scores.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: average(scores),
    median,
  };
}

function errorCodeOf(error: unknown) {
  if (error instanceof SemanticRetrievalError) {
    return error.code;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return SEMANTIC_EMBEDDING_PROVIDER_ERROR;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return SEMANTIC_EMBEDDING_PROVIDER_ERROR;
  }
  return SEMANTIC_EMBEDDING_PROVIDER_ERROR;
}

function assertLiveIdentity(embedded: EmbeddingBatchResult) {
  if (embedded.provider !== "openai") {
    throw new SemanticRetrievalError(
      "Live evaluation received a non-OpenAI embedder.",
      SEMANTIC_EMBEDDING_INVALID,
    );
  }
  if (embedded.model !== DEFAULT_OPENAI_EMBEDDING_MODEL) {
    throw new SemanticRetrievalError(
      "Live evaluation requires text-embedding-3-small.",
      SEMANTIC_EMBEDDING_INVALID,
    );
  }
  if (embedded.dimensions !== DEFAULT_OPENAI_EMBEDDING_DIMENSIONS) {
    throw new SemanticRetrievalError(
      "Embedding dimension mismatch.",
      SEMANTIC_EMBEDDING_INVALID,
    );
  }
  if (embedded.vectors.some((vector) => vector.length !== embedded.dimensions)) {
    throw new SemanticRetrievalError(
      "Embedding dimension mismatch.",
      SEMANTIC_EMBEDDING_INVALID,
    );
  }
}

function decideM10Gate(input: {
  cases: LiveEmbeddingCaseResult[];
  differences: NonNullable<LiveEmbeddingEvaluationReport["differences"]>;
}): LiveEmbeddingEvaluationReport["m10DesignGate"] {
  const recovered = input.cases.some((row) => row.recoveredByM9.length > 0);
  const introduced = input.cases.some((row) => row.introducedByM9.length > 0);
  const missed = input.cases.some((row) => row.missedByM9.length > 0);
  const recallDiff =
    input.differences.find((row) => row.metric === "Recall@10")?.difference ?? 0;
  const precisionDiff =
    input.differences.find((row) => row.metric === "Precision@10")?.difference ??
    0;

  if (!recovered && !introduced && !missed) {
    return {
      sufficientToDesign: false,
      rationale:
        "Live M9 retrieved the same official applications as M8. That is not enough complementarity to justify an M10 hybrid design.",
    };
  }

  return {
    sufficientToDesign: true,
    rationale: [
      "Live text-embedding-3-small was measured on the frozen synthetic set.",
      recovered
        ? "M9 recovered at least one relevant application M8 missed."
        : "M9 did not recover additional relevant applications.",
      introduced
        ? "M9 introduced at least one labeled-not-relevant application."
        : "M9 introduced no extra labeled-not-relevant applications.",
      missed
        ? "M9 missed at least one relevant application M8 found."
        : "M9 did not miss a relevant application M8 found.",
      `Recall@10 difference ${recallDiff >= 0 ? "+" : ""}${recallDiff.toFixed(3)}; Precision@10 difference ${precisionDiff >= 0 ? "+" : ""}${precisionDiff.toFixed(3)}.`,
      "This is enough to design M10 as a measurement, not a claim that M9 is superior.",
    ].join(" "),
  };
}

export async function evaluateLiveProductionEmbeddings(input?: {
  liveEmbedder?: SemanticEmbedder;
}): Promise<LiveEmbeddingEvaluationReport> {
  const startedAt = Date.now();
  const usingTestEmbedder = Boolean(input?.liveEmbedder);
  if (!usingTestEmbedder && !isLiveOpenAiEmbeddingConfigured()) {
    return notRunReport(startedAt);
  }

  const embed: LiveEmbedder = input?.liveEmbedder ?? embedLiveProductionTexts;
  const m8MetricRows: RetrievalMetricRow[][] = [];
  const m9MetricRows: RetrievalMetricRow[][] = [];
  const m8Mrr: number[] = [];
  const m9Mrr: number[] = [];
  const cases: LiveEmbeddingCaseResult[] = [];
  const similarityScores: number[] = [];
  let embeddingLatencyMs = 0;
  let retrievalLatencyMs = 0;
  let embeddingApiCalls = 0;
  let promptTokens: number | null = 0;
  let totalTokens: number | null = 0;
  let sawUsage = false;
  let textUnitsSent = 0;
  let provider: string | null = null;
  let model: string | null = null;
  let dimensions: number | null = null;

  try {
    for (const testCase of RETRIEVAL_BENCHMARK_CASES) {
      const query = buildQuery(testCase);
      const documents = toDocuments(testCase.applications);
      const relevant = relevantIdsFromJudgments(testCase.judgments);

      const retrievalStarted = Date.now();
      const lexical = rankLexicalApplications({
        query,
        applications: documents,
        limit: LIVE_EMBEDDING_RESULT_LIMIT,
      });
      retrievalLatencyMs += Date.now() - retrievalStarted;

      const queryText = redactRetrievalText(buildSemanticJobQueryText(query));
      const evidenceTexts = documents.flatMap((application) =>
        application.evidence
          .filter(
            (evidence) =>
              evidence.revokedAt == null && evidence.supersededById == null,
          )
          .map((evidence) => redactRetrievalText(evidence.inlineText ?? "")),
      );
      const texts = [queryText, ...evidenceTexts.filter(Boolean)];
      textUnitsSent += texts.length;

      const embedStarted = Date.now();
      const embedded = await embed(texts);
      embeddingLatencyMs += Date.now() - embedStarted;
      assertLiveIdentity(embedded);
      provider = embedded.provider;
      model = embedded.model;
      dimensions = embedded.dimensions;
      embeddingApiCalls += embedded.apiCalls ?? 1;
      if (typeof embedded.promptTokens === "number") {
        promptTokens = (promptTokens ?? 0) + embedded.promptTokens;
        sawUsage = true;
      }
      if (typeof embedded.totalTokens === "number") {
        totalTokens = (totalTokens ?? 0) + embedded.totalTokens;
        sawUsage = true;
      }

      const queryVector = embedded.vectors[0];
      if (!queryVector) {
        throw new SemanticRetrievalError(
          "Embedding provider returned an incomplete batch.",
          SEMANTIC_EMBEDDING_INVALID,
        );
      }
      const evidenceVectors = new Map<number, number[]>();
      let vectorIndex = 1;
      for (const application of documents) {
        const evidence = application.evidence[0];
        if (
          !evidence ||
          evidence.revokedAt != null ||
          evidence.supersededById != null
        ) {
          continue;
        }
        const text = redactRetrievalText(evidence.inlineText ?? "");
        if (!text) {
          continue;
        }
        const vector = embedded.vectors[vectorIndex];
        vectorIndex += 1;
        if (!vector) {
          throw new SemanticRetrievalError(
            "Embedding provider returned an incomplete batch.",
            SEMANTIC_EMBEDDING_INVALID,
          );
        }
        evidenceVectors.set(evidence.evidenceId, vector);
      }

      const semanticStarted = Date.now();
      const semantic = rankSemanticApplications({
        queryVector,
        applications: documents,
        evidenceVectors,
        limit: LIVE_EMBEDDING_RESULT_LIMIT,
      });
      retrievalLatencyMs += Date.now() - semanticStarted;

      const lexicalIds = lexical.map((row) => row.applicationId);
      const semanticIds = semantic.map((row) => row.applicationId);
      const relevantSet = new Set(relevant);
      const lexicalSet = new Set(lexicalIds);
      const semanticSet = new Set(semanticIds);
      for (const row of semantic) {
        similarityScores.push(row.semanticScore);
      }

      cases.push({
        caseId: testCase.id,
        relevantIds: relevant,
        m8RetrievedIds: lexicalIds,
        m9RetrievedIds: semanticIds,
        m9Scores: semantic.map((row) => ({
          applicationId: row.applicationId,
          semanticScore: row.semanticScore,
        })),
        recoveredByM9: relevant.filter(
          (id) => semanticSet.has(id) && !lexicalSet.has(id),
        ),
        introducedByM9: semanticIds.filter((id) => !relevantSet.has(id)),
        missedByM9: relevant.filter(
          (id) => lexicalSet.has(id) && !semanticSet.has(id),
        ),
      });
      m8MetricRows.push(metricsFor(relevant, lexicalIds));
      m9MetricRows.push(metricsFor(relevant, semanticIds));
      m8Mrr.push(meanReciprocalRank(relevant, lexicalIds));
      m9Mrr.push(meanReciprocalRank(relevant, semanticIds));
    }
  } catch (error) {
    return {
      ...emptyReport({
        status: "PARTIAL",
        statusCode: errorCodeOf(error),
        startedAt,
        notes: [
          "PARTIAL live evaluation. Official frozen cases were not fully embedded.",
          "hash-projection-v1 was not substituted.",
          usingTestEmbedder
            ? "This run used a test embedder, not production OpenAI."
            : "This run used the live OpenAI embedding path.",
        ],
        m10Rationale:
          "The live corpus was not fully evaluated. M10 hybrid design is not justified from a partial gate.",
        usage: {
          embeddingApiCalls,
          retryCount: 0,
          promptTokens: sawUsage ? promptTokens : null,
          totalTokens: sawUsage ? totalTokens : null,
          textUnitsSent,
          embeddingLatencyMs,
          retrievalLatencyMs,
          providerFailures: 1,
          errorCode: errorCodeOf(error),
        },
      }),
      provider,
      model,
      modelIdentifier: model,
      embeddingDimensions: dimensions,
      cases,
      similarityScores,
      similaritySummary: summarizeScores(similarityScores),
    };
  }

  const m8Metrics = LIVE_EMBEDDING_EVALUATION_K.map((k, index) => ({
    k,
    recall: average(m8MetricRows.map((rows) => rows[index]?.recall ?? 0)),
    precision: average(m8MetricRows.map((rows) => rows[index]?.precision ?? 0)),
    ndcg: average(m8MetricRows.map((rows) => rows[index]?.ndcg ?? 0)),
  }));
  const m9Metrics = LIVE_EMBEDDING_EVALUATION_K.map((k, index) => ({
    k,
    recall: average(m9MetricRows.map((rows) => rows[index]?.recall ?? 0)),
    precision: average(m9MetricRows.map((rows) => rows[index]?.precision ?? 0)),
    ndcg: average(m9MetricRows.map((rows) => rows[index]?.ndcg ?? 0)),
  }));
  const m8 = {
    retrievalVersion: LEXICAL_RETRIEVAL_VERSION,
    metrics: m8Metrics,
    mrr: average(m8Mrr),
  };
  const m9Live = {
    retrievalVersion: SEMANTIC_RETRIEVAL_VERSION,
    embedderLabel: usingTestEmbedder
      ? "test-override-not-production"
      : `openai:${DEFAULT_OPENAI_EMBEDDING_MODEL}`,
    metrics: m9Metrics,
    mrr: average(m9Mrr),
  };
  const differences = [
    ...LIVE_EMBEDDING_EVALUATION_K.flatMap((k, index) => [
      {
        metric: `Recall@${k}`,
        m8: m8Metrics[index]?.recall ?? 0,
        m9Live: m9Metrics[index]?.recall ?? 0,
        difference: (m9Metrics[index]?.recall ?? 0) - (m8Metrics[index]?.recall ?? 0),
      },
      {
        metric: `Precision@${k}`,
        m8: m8Metrics[index]?.precision ?? 0,
        m9Live: m9Metrics[index]?.precision ?? 0,
        difference:
          (m9Metrics[index]?.precision ?? 0) - (m8Metrics[index]?.precision ?? 0),
      },
      {
        metric: `NDCG@${k}`,
        m8: m8Metrics[index]?.ndcg ?? 0,
        m9Live: m9Metrics[index]?.ndcg ?? 0,
        difference: (m9Metrics[index]?.ndcg ?? 0) - (m8Metrics[index]?.ndcg ?? 0),
      },
    ]),
    {
      metric: "MRR",
      m8: m8.mrr,
      m9Live: m9Live.mrr,
      difference: m9Live.mrr - m8.mrr,
    },
  ];

  const diagnostics = await runDiagnosticProbes(embed);
  const report: LiveEmbeddingEvaluationReport = {
    status: usingTestEmbedder ? "PARTIAL" : "COMPLETED",
    statusCode: usingTestEmbedder
      ? "TEST_OVERRIDE_NOT_PRODUCTION"
      : null,
    datasetLabel: RETRIEVAL_BENCHMARK_DATASET_LABEL,
    datasetVersion: RETRIEVAL_BENCHMARK_DATASET_VERSION,
    recordedAt: new Date().toISOString(),
    provider: provider ?? "openai",
    model: model ?? DEFAULT_OPENAI_EMBEDDING_MODEL,
    modelIdentifier: model ?? DEFAULT_OPENAI_EMBEDDING_VERSION,
    embeddingDimensions: dimensions ?? DEFAULT_OPENAI_EMBEDDING_DIMENSIONS,
    retrievalVersion: SEMANTIC_RETRIEVAL_VERSION,
    queryConstructionVersion: SEMANTIC_QUERY_CONSTRUCTION_VERSION,
    representationVersion: SEMANTIC_REPRESENTATION_VERSION,
    candidateRepresentation: "eligible-evidence-text",
    privacyNote: PRIVACY_NOTE,
    m8,
    m9Live,
    differences,
    cases,
    similarityScores,
    similaritySummary: summarizeScores(similarityScores),
    usage: {
      embeddingApiCalls,
      retryCount: 0,
      promptTokens: sawUsage ? promptTokens : null,
      totalTokens: sawUsage ? totalTokens : null,
      textUnitsSent,
      estimatedCostUsd: null,
      costNote: COST_NOTE,
      embeddingLatencyMs,
      retrievalLatencyMs,
      totalRuntimeMs: Date.now() - startedAt,
      providerFailures: 0,
      errorCode: null,
    },
    diagnostics,
    notes: [
      "Labels are SYNTHETIC_NOT_RECRUITER_OUTCOMES.",
      "Official metrics use only the frozen M8 dataset.",
      "Live evaluation does not use hash-projection-v1.",
      usingTestEmbedder
        ? "TEST_OVERRIDE_NOT_PRODUCTION: this successful metric table is not a live OpenAI result."
        : "Live provider is OpenAI text-embedding-3-small.",
      PRIVACY_NOTE,
      COST_NOTE,
    ],
    m10DesignGate: usingTestEmbedder
      ? {
          sufficientToDesign: false,
          rationale:
            "Test override results are not live production evidence. M10 is not justified from this run.",
        }
      : decideM10Gate({ cases, differences }),
  };
  return report;
}

async function runDiagnosticProbes(
  embed: LiveEmbedder,
): Promise<LiveEmbeddingEvaluationReport["diagnostics"]> {
  const probes: LiveEmbeddingDiagnosticProbe[] = [];
  try {
    for (const probe of DIAGNOSTIC_PROBES) {
      const query = buildQuery({ jobPrimarySkills: probe.jobPrimarySkills });
      const documents = toDocuments([
        {
          applicationId: 1,
          candidateId: 1,
          companyId: 1,
          jobId: 10,
          text: probe.evidenceText,
        },
      ]);
      const lexical = rankLexicalApplications({
        query,
        applications: documents,
        limit: LIVE_EMBEDDING_RESULT_LIMIT,
      });
      const queryText = redactRetrievalText(buildSemanticJobQueryText(query));
      const evidenceText = redactRetrievalText(probe.evidenceText);
      const embedded = await embed([queryText, evidenceText]);
      assertLiveIdentity(embedded);
      const queryVector = embedded.vectors[0];
      const evidenceVector = embedded.vectors[1];
      if (!queryVector || !evidenceVector) {
        throw new SemanticRetrievalError(
          "Embedding provider returned an incomplete batch.",
          SEMANTIC_EMBEDDING_INVALID,
        );
      }
      const semantic = rankSemanticApplications({
        queryVector,
        applications: documents,
        evidenceVectors: new Map([[10, evidenceVector]]),
        limit: LIVE_EMBEDDING_RESULT_LIMIT,
      });
      probes.push({
        id: probe.id,
        inspectedFailureMode: probe.inspectedFailureMode,
        inOfficialBenchmark: false,
        jobPrimarySkills: probe.jobPrimarySkills,
        evidenceText: "[REDACTED_NOT_LOGGED]",
        lexicalRetrieved: lexical.length > 0,
        semanticRetrieved: semantic.length > 0,
        semanticScore: semantic[0]?.semanticScore ?? null,
      });
    }
    return {
      label: "DIAGNOSTIC_NOT_IN_BENCHMARK",
      status: "COMPLETED",
      probes,
      notes: [
        "These probes are not in RETRIEVAL_BENCHMARK_CASES and are not averaged into official metrics.",
        "Evidence text is not recorded in the report.",
      ],
    };
  } catch (error) {
    return {
      label: "DIAGNOSTIC_NOT_IN_BENCHMARK",
      status: "PARTIAL",
      probes,
      notes: [
        "Diagnostic probes failed after official cases completed.",
        `errorCode=${errorCodeOf(error)}`,
      ],
    };
  }
}

export function liveEvaluationIsProductionComplete(
  report: LiveEmbeddingEvaluationReport,
) {
  return (
    report.status === "COMPLETED" &&
    report.statusCode == null &&
    report.m9Live?.embedderLabel === `openai:${DEFAULT_OPENAI_EMBEDDING_MODEL}`
  );
}
