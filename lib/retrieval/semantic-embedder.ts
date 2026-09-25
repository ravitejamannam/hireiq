import { createHash } from "node:crypto";

import {
  SEMANTIC_EMBEDDING_INVALID,
  SEMANTIC_EMBEDDING_PROVIDER_ERROR,
  SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
  SemanticRetrievalError,
} from "@/lib/retrieval/semantic-retrieval-errors";
import { assertEmbeddingVector, l2Normalize } from "@/lib/retrieval/semantic-cosine";
import {
  DEFAULT_OPENAI_EMBEDDING_DIMENSIONS,
  DEFAULT_OPENAI_EMBEDDING_MODEL,
  DEFAULT_OPENAI_EMBEDDING_VERSION,
  OFFLINE_EMBEDDING_DIMENSIONS,
  OFFLINE_EMBEDDING_MODEL,
  OFFLINE_EMBEDDING_PROVIDER,
  OFFLINE_EMBEDDING_VERSION,
} from "@/lib/retrieval/semantic-retrieval-versions";

export type EmbeddingBatchResult = {
  vectors: number[][];
  provider: string;
  model: string;
  modelVersion: string;
  dimensions: number;
  promptTokens?: number | null;
  totalTokens?: number | null;
  apiCalls?: number;
};

export type SemanticEmbedder = (texts: string[]) => Promise<EmbeddingBatchResult>;

let embedderOverride: SemanticEmbedder | null = null;

export function setSemanticEmbedderForTests(embedder: SemanticEmbedder | null) {
  embedderOverride = embedder;
}

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export function getSemanticEmbeddingModel() {
  return (
    process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_OPENAI_EMBEDDING_MODEL
  );
}

export function isSemanticEmbeddingConfigured() {
  return Boolean(embedderOverride || getOpenAiApiKey());
}

/** True only when a live OpenAI key exists. Test overrides do not count. */
export function isLiveOpenAiEmbeddingConfigured() {
  return Boolean(getOpenAiApiKey());
}

export function embedHashProjection(
  text: string,
  dimensions = OFFLINE_EMBEDDING_DIMENSIONS,
): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }
  for (const token of tokens) {
    const digest = createHash("sha256").update(token, "utf8").digest();
    const index = digest.readUInt32BE(0) % dimensions;
    const sign = digest[4]! % 2 === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }
  return l2Normalize(vector);
}

export function createOfflineHashProjectionEmbedder(): SemanticEmbedder {
  return async (texts) => ({
    vectors: texts.map((text) => embedHashProjection(text)),
    provider: OFFLINE_EMBEDDING_PROVIDER,
    model: OFFLINE_EMBEDDING_MODEL,
    modelVersion: OFFLINE_EMBEDDING_VERSION,
    dimensions: OFFLINE_EMBEDDING_DIMENSIONS,
  });
}

async function embedWithOpenAi(texts: string[]): Promise<EmbeddingBatchResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new SemanticRetrievalError(
      "Semantic embeddings are not configured.",
      SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
    );
  }
  const model = getSemanticEmbeddingModel();
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new SemanticRetrievalError(
      "Embedding provider error.",
      SEMANTIC_EMBEDDING_PROVIDER_ERROR,
    );
  }
  const payload = (await response.json()) as {
    data?: Array<{ embedding?: unknown }>;
    usage?: { prompt_tokens?: number; total_tokens?: number };
  };
  const rows = payload.data ?? [];
  if (rows.length !== texts.length) {
    throw new SemanticRetrievalError(
      "Embedding provider returned an incomplete batch.",
      SEMANTIC_EMBEDDING_INVALID,
    );
  }
  const vectors = rows.map((row) =>
    assertEmbeddingVector(row.embedding, DEFAULT_OPENAI_EMBEDDING_DIMENSIONS),
  );
  return {
    vectors,
    provider: "openai",
    model,
    modelVersion: DEFAULT_OPENAI_EMBEDDING_VERSION,
    dimensions: DEFAULT_OPENAI_EMBEDDING_DIMENSIONS,
    promptTokens:
      typeof payload.usage?.prompt_tokens === "number"
        ? payload.usage.prompt_tokens
        : null,
    totalTokens:
      typeof payload.usage?.total_tokens === "number"
        ? payload.usage.total_tokens
        : null,
    apiCalls: 1,
  };
}

/**
 * Live OpenAI embeddings only. Ignores the test override and never uses
 * hash-projection-v1. Used by the M9.1 production evaluation gate.
 */
export async function embedLiveProductionTexts(
  texts: string[],
): Promise<EmbeddingBatchResult> {
  if (!getOpenAiApiKey()) {
    throw new SemanticRetrievalError(
      "Semantic embeddings are not configured.",
      SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
    );
  }
  if (texts.length === 0) {
    return {
      vectors: [],
      provider: "openai",
      model: getSemanticEmbeddingModel(),
      modelVersion: DEFAULT_OPENAI_EMBEDDING_VERSION,
      dimensions: DEFAULT_OPENAI_EMBEDDING_DIMENSIONS,
      promptTokens: 0,
      totalTokens: 0,
      apiCalls: 0,
    };
  }
  const batches: number[][] = [];
  let promptTokens = 0;
  let totalTokens = 0;
  let sawUsage = false;
  let apiCalls = 0;
  let meta: EmbeddingBatchResult | null = null;
  for (let index = 0; index < texts.length; index += 64) {
    const slice = texts.slice(index, index + 64);
    const result = await embedWithOpenAi(slice);
    meta = result;
    batches.push(...result.vectors);
    apiCalls += result.apiCalls ?? 1;
    if (typeof result.promptTokens === "number") {
      promptTokens += result.promptTokens;
      sawUsage = true;
    }
    if (typeof result.totalTokens === "number") {
      totalTokens += result.totalTokens;
      sawUsage = true;
    }
  }
  if (!meta) {
    throw new SemanticRetrievalError(
      "Embedding provider error.",
      SEMANTIC_EMBEDDING_PROVIDER_ERROR,
    );
  }
  return {
    ...meta,
    vectors: batches,
    promptTokens: sawUsage ? promptTokens : null,
    totalTokens: sawUsage ? totalTokens : null,
    apiCalls,
  };
}

export async function embedRetrievalTexts(
  texts: string[],
): Promise<EmbeddingBatchResult> {
  if (texts.length === 0) {
    const configured = embedderOverride
      ? await embedderOverride([" "])
      : {
          vectors: [] as number[][],
          provider: getOpenAiApiKey() ? "openai" : OFFLINE_EMBEDDING_PROVIDER,
          model: getOpenAiApiKey()
            ? getSemanticEmbeddingModel()
            : OFFLINE_EMBEDDING_MODEL,
          modelVersion: getOpenAiApiKey()
            ? DEFAULT_OPENAI_EMBEDDING_VERSION
            : OFFLINE_EMBEDDING_VERSION,
          dimensions: getOpenAiApiKey()
            ? DEFAULT_OPENAI_EMBEDDING_DIMENSIONS
            : OFFLINE_EMBEDDING_DIMENSIONS,
        };
    return { ...configured, vectors: [] };
  }
  if (embedderOverride) {
    return embedderOverride(texts);
  }
  if (getOpenAiApiKey()) {
    const batches: number[][] = [];
    let meta: EmbeddingBatchResult | null = null;
    for (let index = 0; index < texts.length; index += 64) {
      const slice = texts.slice(index, index + 64);
      const result = await embedWithOpenAi(slice);
      meta = result;
      batches.push(...result.vectors);
    }
    if (!meta) {
      throw new SemanticRetrievalError(
        "Embedding provider error.",
        SEMANTIC_EMBEDDING_PROVIDER_ERROR,
      );
    }
    return { ...meta, vectors: batches };
  }
  throw new SemanticRetrievalError(
    "Semantic embeddings are not configured.",
    SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
  );
}
