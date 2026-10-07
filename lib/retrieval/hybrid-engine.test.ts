import { describe, expect, it } from "vitest";
import { PortalRole } from "@prisma/client";

import { assertCompatibleHybridBaselines } from "@/lib/retrieval/hybrid-baseline";
import {
  fuseReciprocalRank,
  reciprocalRankContribution,
  resolveHybridRunDisposition,
} from "@/lib/retrieval/hybrid-engine";
import { STALE_HYBRID_RETRIEVAL_RUNNING_MS } from "@/lib/retrieval/hybrid-retrieval-versions";
import { LEXICAL_RETRIEVAL_VERSION } from "@/lib/retrieval/lexical-retrieval-versions";
import { SEMANTIC_RETRIEVAL_VERSION } from "@/lib/retrieval/semantic-retrieval-versions";
import { isAdminHybridRetrievalRole } from "@/lib/validation/hybrid-retrieval-validation";

const hit = (applicationId: number, rank: number, candidateId = applicationId) => ({
  applicationId,
  candidateId,
  companyId: 1,
  rank,
});

describe("hybrid reciprocal rank fusion", () => {
  it("scores an application that appears only in M8", () => {
    const [row] = fuseReciprocalRank({
      companyId: 1,
      lexical: [hit(4, 1)],
      semantic: [],
      limit: 10,
    });
    expect(row?.rrfScore).toBe(reciprocalRankContribution(1));
    expect(row?.rrfScore).toBe(1 / 61);
    expect(row?.lexicalRank).toBe(1);
    expect(row?.semanticRank).toBeNull();
    expect(row).not.toHaveProperty("candidateScore");
  });

  it("scores an application that appears only in M9", () => {
    const [row] = fuseReciprocalRank({
      companyId: 1,
      lexical: [],
      semantic: [hit(7, 2)],
      limit: 10,
    });
    expect(row?.rrfScore).toBe(1 / 62);
    expect(row?.lexicalRank).toBeNull();
    expect(row?.semanticRank).toBe(2);
  });

  it("adds both contributions when an application appears in both lists", () => {
    const [row] = fuseReciprocalRank({
      companyId: 1,
      lexical: [hit(3, 1)],
      semantic: [hit(3, 1)],
      limit: 10,
    });
    expect(row?.rrfScore).toBe(1 / 61 + 1 / 61);
    expect(row?.lexicalRank).toBe(1);
    expect(row?.semanticRank).toBe(1);
  });

  it("ranks a higher RRF score first", () => {
    const rows = fuseReciprocalRank({
      companyId: 1,
      lexical: [hit(2, 1)],
      semantic: [hit(2, 5), hit(9, 1)],
      limit: 10,
    });
    expect(rows.map((row) => row.applicationId)).toEqual([2, 9]);
  });

  it("breaks equal RRF scores by applicationId ascending", () => {
    const rows = fuseReciprocalRank({
      companyId: 1,
      lexical: [hit(8, 1), hit(3, 1)],
      semantic: [],
      limit: 10,
    });
    expect(rows.map((row) => row.applicationId)).toEqual([3, 8]);
    expect(rows[0]?.rrfScore).toBe(rows[1]?.rrfScore);
  });

  it("truncates to resultLimit", () => {
    const rows = fuseReciprocalRank({
      companyId: 1,
      lexical: [hit(1, 1), hit(2, 2), hit(3, 3)],
      semantic: [],
      limit: 2,
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.applicationId)).toEqual([1, 2]);
  });

  it("keeps each application once in the union", () => {
    const rows = fuseReciprocalRank({
      companyId: 1,
      lexical: [hit(5, 4)],
      semantic: [hit(5, 2)],
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lexicalRank).toBe(4);
    expect(rows[0]?.semanticRank).toBe(2);
  });

  it("handles an empty M8 result set", () => {
    const rows = fuseReciprocalRank({
      companyId: 1,
      lexical: [],
      semantic: [hit(1, 1)],
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lexicalRank).toBeNull();
  });

  it("handles an empty M9 result set", () => {
    const rows = fuseReciprocalRank({
      companyId: 1,
      lexical: [hit(1, 1)],
      semantic: [],
      limit: 10,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.semanticRank).toBeNull();
  });

  it("rejects a baseline row from another company", () => {
    expect(() =>
      fuseReciprocalRank({
        companyId: 1,
        lexical: [{ applicationId: 1, candidateId: 1, companyId: 2, rank: 1 }],
        semantic: [],
        limit: 10,
      }),
    ).toThrow(/company/);
  });
});

const completed = {
  id: 1,
  companyId: 1,
  jobId: 9,
  jobSpecificationVersionId: 4,
  status: "COMPLETED" as const,
  retrievalVersion: LEXICAL_RETRIEVAL_VERSION,
  resultLimit: 100,
  results: [],
};

describe("hybrid baseline compatibility", () => {
  it("rejects a wrong-company baseline", () => {
    expect(() =>
      assertCompatibleHybridBaselines({
        companyId: 1,
        jobId: 9,
        limit: 10,
        lexical: { ...completed, companyId: 2 },
        semantic: { ...completed, id: 2, retrievalVersion: SEMANTIC_RETRIEVAL_VERSION },
      }),
    ).toThrow(/outside this company/);
  });

  it("rejects a baseline that is not completed", () => {
    expect(() =>
      assertCompatibleHybridBaselines({
        companyId: 1,
        jobId: 9,
        limit: 10,
        lexical: { ...completed, status: "RUNNING" },
        semantic: { ...completed, id: 2, retrievalVersion: SEMANTIC_RETRIEVAL_VERSION },
      }),
    ).toThrow(/not completed/);
  });
});

describe("hybrid run lifecycle", () => {
  it("reuses a completed experiment", () => {
    expect(
      resolveHybridRunDisposition({
        completedExists: true,
        runningAgeMs: null,
        staleMs: STALE_HYBRID_RETRIEVAL_RUNNING_MS,
      }),
    ).toBe("reuse");
  });

  it("refuses a fresh running duplicate", () => {
    expect(
      resolveHybridRunDisposition({
        completedExists: false,
        runningAgeMs: 1_000,
        staleMs: STALE_HYBRID_RETRIEVAL_RUNNING_MS,
      }),
    ).toBe("refuse");
  });

  it("recovers a stale running row", () => {
    expect(
      resolveHybridRunDisposition({
        completedExists: false,
        runningAgeMs: STALE_HYBRID_RETRIEVAL_RUNNING_MS,
        staleMs: STALE_HYBRID_RETRIEVAL_RUNNING_MS,
      }),
    ).toBe("recover");
  });
});

describe("hybrid authorization boundary", () => {
  it("allows only admin", () => {
    expect(isAdminHybridRetrievalRole(PortalRole.ADMIN)).toBe(true);
    expect(isAdminHybridRetrievalRole(PortalRole.CLIENT)).toBe(false);
    expect(isAdminHybridRetrievalRole(PortalRole.INTERVIEWER)).toBe(false);
  });
});
