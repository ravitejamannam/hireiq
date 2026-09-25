import {
  SEMANTIC_EMBEDDING_INVALID,
  SemanticRetrievalError,
} from "@/lib/retrieval/semantic-retrieval-errors";

function invalidEmbedding(): never {
  throw new SemanticRetrievalError(
    "Embedding vector is invalid.",
    SEMANTIC_EMBEDDING_INVALID,
  );
}

export function l2Normalize(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    invalidEmbedding();
  }
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) {
    invalidEmbedding();
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    invalidEmbedding();
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function assertEmbeddingVector(vector: unknown, dimensions: number): number[] {
  if (!Array.isArray(vector) || vector.length !== dimensions) {
    invalidEmbedding();
  }
  const values = vector.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      invalidEmbedding();
    }
    return value;
  });
  if (values.every((value) => value === 0)) {
    invalidEmbedding();
  }
  return values;
}
