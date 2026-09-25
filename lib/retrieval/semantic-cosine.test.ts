import { describe, expect, it } from "vitest";

import {
  assertEmbeddingVector,
  cosineSimilarity,
  l2Normalize,
} from "@/lib/retrieval/semantic-cosine";
import { SemanticRetrievalError } from "@/lib/retrieval/semantic-retrieval-errors";

describe("semantic cosine", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it("rejects dimension mismatch and zero vectors", () => {
    expect(() => cosineSimilarity([1, 0], [1])).toThrow(SemanticRetrievalError);
    expect(() => assertEmbeddingVector([0, 0], 2)).toThrow(SemanticRetrievalError);
    expect(() => assertEmbeddingVector([1], 2)).toThrow(SemanticRetrievalError);
    expect(() => l2Normalize([0, 0])).toThrow(SemanticRetrievalError);
  });

  it("normalizes a non-zero vector", () => {
    expect(l2Normalize([3, 4])).toEqual([0.6, 0.8]);
  });
});
