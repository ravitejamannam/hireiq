import { afterEach, describe, expect, it } from "vitest";

import {
  LIVE_PRODUCTION_EMBEDDING_NOT_RUN,
  evaluateLiveProductionEmbeddings,
  liveEvaluationIsProductionComplete,
} from "@/lib/evaluation/live-embedding-evaluation";
import {
  RETRIEVAL_BENCHMARK_CASES,
  RETRIEVAL_BENCHMARK_DATASET_LABEL,
  RETRIEVAL_BENCHMARK_DATASET_VERSION,
} from "@/lib/evaluation/retrieval-benchmark-dataset";
import { compareLexicalAndSemanticBaselines } from "@/lib/retrieval/semantic-comparison";
import {
  embedLiveProductionTexts,
  isLiveOpenAiEmbeddingConfigured,
  setSemanticEmbedderForTests,
  type EmbeddingBatchResult,
} from "@/lib/retrieval/semantic-embedder";
import {
  SEMANTIC_EMBEDDING_INVALID,
  SEMANTIC_EMBEDDING_PROVIDER_ERROR,
  SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
  SemanticRetrievalError,
} from "@/lib/retrieval/semantic-retrieval-errors";
import { DEFAULT_OPENAI_EMBEDDING_DIMENSIONS } from "@/lib/retrieval/semantic-retrieval-versions";

afterEach(() => {
  setSemanticEmbedderForTests(null);
});

function unitVector(index: number): number[] {
  const vector = Array.from({ length: DEFAULT_OPENAI_EMBEDDING_DIMENSIONS }, () => 0);
  vector[index] = 1;
  return vector;
}

function openaiResult(vectors: number[][]): EmbeddingBatchResult {
  return {
    vectors,
    provider: "openai",
    model: "text-embedding-3-small",
    modelVersion: "text-embedding-3-small",
    dimensions: DEFAULT_OPENAI_EMBEDDING_DIMENSIONS,
    promptTokens: vectors.length,
    totalTokens: vectors.length,
    apiCalls: 1,
  };
}

describe("live production embedding evaluation gate", () => {
  it("fails closed without OPENAI_API_KEY and does not use hash-projection", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    setSemanticEmbedderForTests(async () => openaiResult([unitVector(0)]));

    expect(isLiveOpenAiEmbeddingConfigured()).toBe(false);
    await expect(embedLiveProductionTexts(["Python"])).rejects.toMatchObject({
      code: SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
    });

    const report = await evaluateLiveProductionEmbeddings();
    expect(report.status).toBe("NOT_RUN");
    expect(report.statusCode).toBe(LIVE_PRODUCTION_EMBEDDING_NOT_RUN);
    expect(report.m8).toBeNull();
    expect(report.m9Live).toBeNull();
    expect(report.m10DesignGate.sufficientToDesign).toBe(false);
    expect(report.notes.join(" ")).toContain("hash-projection-v1 was not substituted");
    expect(liveEvaluationIsProductionComplete(report)).toBe(false);

    if (previous) {
      process.env.OPENAI_API_KEY = previous;
    }
  });

  it("keeps the frozen official dataset and offline comparison separate", async () => {
    expect(RETRIEVAL_BENCHMARK_DATASET_LABEL).toBe(
      "SYNTHETIC_NOT_RECRUITER_OUTCOMES",
    );
    expect(RETRIEVAL_BENCHMARK_DATASET_VERSION).toBe("m8-frozen-v1");
    expect(RETRIEVAL_BENCHMARK_CASES.map((row) => row.id)).toEqual([
      "exact-python",
      "alias-javascript",
      "false-friend-react-native",
      "negation-django",
      "missing-evidence",
    ]);
    const offline = await compareLexicalAndSemanticBaselines();
    expect(offline.m9.embedderLabel).toBe("offline:hash-projection-v1");
  });

  it("marks provider failure as PARTIAL", async () => {
    const report = await evaluateLiveProductionEmbeddings({
      liveEmbedder: async () => {
        throw new SemanticRetrievalError(
          "Embedding provider error.",
          SEMANTIC_EMBEDDING_PROVIDER_ERROR,
        );
      },
    });
    expect(report.status).toBe("PARTIAL");
    expect(report.statusCode).toBe(SEMANTIC_EMBEDDING_PROVIDER_ERROR);
    expect(report.usage.providerFailures).toBe(1);
    expect(report.m10DesignGate.sufficientToDesign).toBe(false);
  });

  it("marks timeout as PARTIAL", async () => {
    const report = await evaluateLiveProductionEmbeddings({
      liveEmbedder: async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      },
    });
    expect(report.status).toBe("PARTIAL");
    expect(report.statusCode).toBe(SEMANTIC_EMBEDDING_PROVIDER_ERROR);
  });

  it("marks incomplete batches as PARTIAL", async () => {
    const report = await evaluateLiveProductionEmbeddings({
      liveEmbedder: async (texts) =>
        openaiResult(texts.slice(1).map(() => unitVector(0))),
    });
    expect(report.status).toBe("PARTIAL");
    expect(report.statusCode).toBe(SEMANTIC_EMBEDDING_INVALID);
  });

  it("marks dimension mismatch as PARTIAL", async () => {
    const report = await evaluateLiveProductionEmbeddings({
      liveEmbedder: async (texts) => ({
        vectors: texts.map(() => [1, 0]),
        provider: "openai",
        model: "text-embedding-3-small",
        modelVersion: "text-embedding-3-small",
        dimensions: 2,
        apiCalls: 1,
      }),
    });
    expect(report.status).toBe("PARTIAL");
    expect(report.statusCode).toBe(SEMANTIC_EMBEDDING_INVALID);
  });

  it("computes official metrics from a conforming test embedder without calling it production", async () => {
    const report = await evaluateLiveProductionEmbeddings({
      liveEmbedder: async (texts) =>
        openaiResult(
          texts.map((text) =>
            text.toLowerCase().includes("python") ? unitVector(0) : unitVector(1),
          ),
        ),
    });
    expect(report.status).toBe("PARTIAL");
    expect(report.statusCode).toBe("TEST_OVERRIDE_NOT_PRODUCTION");
    expect(report.datasetLabel).toBe("SYNTHETIC_NOT_RECRUITER_OUTCOMES");
    expect(report.m8?.metrics.map((row) => row.k)).toEqual([10, 25, 50, 100]);
    expect(report.m9Live?.metrics.map((row) => row.k)).toEqual([10, 25, 50, 100]);
    expect(report.m9Live?.embedderLabel).toBe("test-override-not-production");
    expect(report.usage.retryCount).toBe(0);
    expect(report.usage.estimatedCostUsd).toBeNull();
    expect(report.cases.map((row) => row.caseId)).toEqual(
      RETRIEVAL_BENCHMARK_CASES.map((row) => row.id),
    );
    expect(JSON.stringify(report)).not.toMatch(/candidateScore/);
    expect(liveEvaluationIsProductionComplete(report)).toBe(false);
    expect(report.m10DesignGate.sufficientToDesign).toBe(false);
  });
});
