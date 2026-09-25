import { afterEach, describe, expect, it } from "vitest";
import { PortalRole } from "@prisma/client";

import {
  createOfflineHashProjectionEmbedder,
  embedHashProjection,
  embedLiveProductionTexts,
  embedRetrievalTexts,
  isLiveOpenAiEmbeddingConfigured,
  isSemanticEmbeddingConfigured,
  setSemanticEmbedderForTests,
} from "@/lib/retrieval/semantic-embedder";
import {
  hashEmbeddingContent,
  redactRetrievalText,
} from "@/lib/retrieval/semantic-representation";
import {
  SEMANTIC_EMBEDDING_PROVIDER_ERROR,
  SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
  SemanticRetrievalError,
} from "@/lib/retrieval/semantic-retrieval-errors";
import { isAdminSemanticRetrievalRole } from "@/lib/validation/semantic-retrieval-validation";

afterEach(() => {
  setSemanticEmbedderForTests(null);
});

describe("semantic embedder", () => {
  it("is deterministic for the same text", () => {
    const first = embedHashProjection("Python backend");
    const second = embedHashProjection("Python backend");
    expect(first).toEqual(second);
    expect(first).toHaveLength(32);
  });

  it("does not regenerate a different vector when content is unchanged", async () => {
    const embedder = createOfflineHashProjectionEmbedder();
    const once = await embedder(["Eligible evidence about Python."]);
    const twice = await embedder(["Eligible evidence about Python."]);
    expect(once.vectors[0]).toEqual(twice.vectors[0]);
    expect(once.model).toBe("hash-projection-v1");
    expect(hashEmbeddingContent("Eligible evidence about Python.")).toHaveLength(64);
  });

  it("does not treat a test override as live OpenAI configuration", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    setSemanticEmbedderForTests(createOfflineHashProjectionEmbedder());
    expect(isSemanticEmbeddingConfigured()).toBe(true);
    expect(isLiveOpenAiEmbeddingConfigured()).toBe(false);
    await expect(embedLiveProductionTexts(["Python"])).rejects.toMatchObject({
      code: SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
    });
    if (previous) {
      process.env.OPENAI_API_KEY = previous;
    }
  });

  it("fails closed when no provider or test override is configured", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(isSemanticEmbeddingConfigured()).toBe(false);
    await expect(embedRetrievalTexts(["Python"])).rejects.toMatchObject({
      name: "SemanticRetrievalError",
      code: SEMANTIC_EMBEDDINGS_NOT_CONFIGURED,
    });
    if (previous) {
      process.env.OPENAI_API_KEY = previous;
    }
  });

  it("surfaces provider failure without a successful batch", async () => {
    setSemanticEmbedderForTests(async () => {
      throw new SemanticRetrievalError(
        "Embedding provider error.",
        SEMANTIC_EMBEDDING_PROVIDER_ERROR,
      );
    });
    await expect(embedRetrievalTexts(["Python"])).rejects.toMatchObject({
      code: SEMANTIC_EMBEDDING_PROVIDER_ERROR,
    });
  });

  it("redacts email and phone before embedding text is stored in the request", () => {
    const redacted = redactRetrievalText(
      "Reach me at jane@example.com or +1 (415) 555-0100 about Python.",
    );
    expect(redacted).toContain("[REDACTED_EMAIL]");
    expect(redacted).toContain("[REDACTED_PHONE]");
    expect(redacted).not.toContain("jane@example.com");
    expect(redacted).toContain("Python");
  });

  it("keeps retrieval admin-only", () => {
    expect(isAdminSemanticRetrievalRole(PortalRole.ADMIN)).toBe(true);
    expect(isAdminSemanticRetrievalRole(PortalRole.CLIENT)).toBe(false);
    expect(isAdminSemanticRetrievalRole(PortalRole.INTERVIEWER)).toBe(false);
  });
});
