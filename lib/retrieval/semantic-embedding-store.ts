import { RetrievalEmbeddingSourceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { withCandidateWriteGuard } from "@/lib/privacy/erasure-guard";
import {
  createRetrievalEmbeddings,
  listRetrievalEmbeddings,
} from "@/lib/repositories/semantic-retrieval-repository";
import { assertEmbeddingVector } from "@/lib/retrieval/semantic-cosine";
import { embedRetrievalTexts } from "@/lib/retrieval/semantic-embedder";
import {
  SEMANTIC_EMBEDDING_INVALID,
  SemanticRetrievalError,
} from "@/lib/retrieval/semantic-retrieval-errors";

export type EmbeddingIdentity = {
  companyId: number;
  modelProvider: string;
  modelName: string;
  modelVersion: string;
  dimensions: number;
  normalizationVersion: string;
};

export type EmbeddingRequest = {
  sourceType: RetrievalEmbeddingSourceType;
  sourceId: number;
  contentHash: string;
  text: string;
};

export async function loadOrCreateRetrievalEmbeddings(input: {
  identity: EmbeddingIdentity;
  requests: EmbeddingRequest[];
}): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>();
  if (input.requests.length === 0) {
    return vectors;
  }

  const byType = new Map<RetrievalEmbeddingSourceType, EmbeddingRequest[]>();
  for (const request of input.requests) {
    const group = byType.get(request.sourceType) ?? [];
    group.push(request);
    byType.set(request.sourceType, group);
  }

  for (const [sourceType, requests] of byType) {
    const stored = await listRetrievalEmbeddings({
      companyId: input.identity.companyId,
      sourceType,
      sourceIds: requests.map((row) => row.sourceId),
      modelProvider: input.identity.modelProvider,
      modelName: input.identity.modelName,
      modelVersion: input.identity.modelVersion,
      normalizationVersion: input.identity.normalizationVersion,
    });
    if (stored.some((row) => row.companyId !== input.identity.companyId)) {
      throw new SemanticRetrievalError(
        "Embedding tenant mismatch.",
        SEMANTIC_EMBEDDING_INVALID,
      );
    }
    for (const row of stored) {
      const key = `${row.sourceType}:${row.sourceId}:${row.contentHash}`;
      if (row.dimensions !== input.identity.dimensions) {
        throw new SemanticRetrievalError(
          "Embedding dimension mismatch.",
          SEMANTIC_EMBEDDING_INVALID,
        );
      }
      vectors.set(
        key,
        assertEmbeddingVector(row.vector, input.identity.dimensions),
      );
    }
  }

  const missing = input.requests.filter(
    (request) =>
      !vectors.has(`${request.sourceType}:${request.sourceId}:${request.contentHash}`),
  );
  if (missing.length === 0) {
    return vectors;
  }

  const embedded = await embedRetrievalTexts(missing.map((row) => row.text), {
    companyId: input.identity.companyId,
    entityType: "Company",
    entityId: input.identity.companyId,
  });
  if (
    embedded.provider !== input.identity.modelProvider ||
    embedded.model !== input.identity.modelName ||
    embedded.modelVersion !== input.identity.modelVersion ||
    embedded.dimensions !== input.identity.dimensions
  ) {
    throw new SemanticRetrievalError(
      "Embedding identity mismatch.",
      SEMANTIC_EMBEDDING_INVALID,
    );
  }
  if (embedded.vectors.length !== missing.length) {
    throw new SemanticRetrievalError(
      "Embedding provider returned an incomplete batch.",
      SEMANTIC_EMBEDDING_INVALID,
    );
  }

  const created = missing.map((request, index) => {
    const vector = assertEmbeddingVector(
      embedded.vectors[index],
      input.identity.dimensions,
    );
    vectors.set(
      `${request.sourceType}:${request.sourceId}:${request.contentHash}`,
      vector,
    );
    return {
      companyId: input.identity.companyId,
      sourceType: request.sourceType,
      sourceId: request.sourceId,
      contentHash: request.contentHash,
      modelProvider: input.identity.modelProvider,
      modelName: input.identity.modelName,
      modelVersion: input.identity.modelVersion,
      dimensions: input.identity.dimensions,
      normalizationVersion: input.identity.normalizationVersion,
      vector,
    };
  });

  // Job-query vectors are not about a person. Evidence vectors are stored per owning candidate, under the
  // erasure guard, so an embedding that finished after erasure is dropped instead of stored.
  const evidenceRows = created.filter((row) => row.sourceType === RetrievalEmbeddingSourceType.EVIDENCE);
  const otherRows = created.filter((row) => row.sourceType !== RetrievalEmbeddingSourceType.EVIDENCE);
  await createRetrievalEmbeddings(otherRows);
  if (evidenceRows.length > 0) {
    const owners = await prisma.candidateEvidence.findMany({
      where: { companyId: input.identity.companyId, id: { in: evidenceRows.map((row) => row.sourceId) } },
      select: { id: true, candidateId: true },
    });
    const byCandidate = new Map<number, typeof evidenceRows>();
    for (const owner of owners) {
      const rows = evidenceRows.filter((row) => row.sourceId === owner.id);
      byCandidate.set(owner.candidateId, [...(byCandidate.get(owner.candidateId) ?? []), ...rows]);
    }
    for (const [candidateId, rows] of byCandidate) {
      await withCandidateWriteGuard(candidateId, input.identity.companyId, (tx) => createRetrievalEmbeddings(rows, tx));
    }
  }
  return vectors;
}

export function embeddingCacheKey(
  sourceType: RetrievalEmbeddingSourceType,
  sourceId: number,
  contentHash: string,
) {
  return `${sourceType}:${sourceId}:${contentHash}`;
}
