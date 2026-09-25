import { describe, expect, it } from "vitest";

import { extractJobRequirements } from "@/lib/jobs/intelligence/job-intelligence-extractor";
import { rankLexicalApplications } from "@/lib/retrieval/lexical-engine";
import { buildLexicalQuery } from "@/lib/retrieval/lexical-query";
import {
  collectEligibleEvidence,
  explainSemanticRetrieval,
  rankSemanticApplications,
  scoreSemanticApplication,
} from "@/lib/retrieval/semantic-engine";
import type { LexicalApplicationDocument } from "@/lib/retrieval/lexical-retrieval-types";

function application(input: {
  applicationId: number;
  candidateId: number;
  companyId?: number;
  jobId?: number;
  evidenceId?: number;
  text: string;
  revoked?: boolean;
  superseded?: boolean;
}): LexicalApplicationDocument {
  return {
    applicationId: input.applicationId,
    candidateId: input.candidateId,
    companyId: input.companyId ?? 1,
    jobId: input.jobId ?? 10,
    evidence: [
      {
        evidenceId: input.evidenceId ?? input.applicationId * 10,
        applicationId: input.applicationId,
        candidateId: input.candidateId,
        companyId: input.companyId ?? 1,
        inlineText: input.text,
        contentSha256: "hash",
        revokedAt: input.revoked ? new Date() : null,
        supersededById: input.superseded ? 99 : null,
      },
    ],
  };
}

function reactQuery() {
  const requirements = extractJobRequirements({
    title: "Frontend",
    primarySkills: "React",
    mustHaveRequirements: null,
    niceToHaveRequirements: null,
    location: null,
    experienceRange: null,
    jobDescription: null,
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

describe("semantic retrieval engine", () => {
  it("orders applications by max evidence cosine and respects K", () => {
    const queryVector = [1, 0];
    const applications = [
      application({ applicationId: 2, candidateId: 2, text: "mid" }),
      application({ applicationId: 1, candidateId: 1, text: "best" }),
      application({ applicationId: 3, candidateId: 3, text: "low" }),
    ];
    const evidenceVectors = new Map<number, number[]>([
      [20, [0.6, 0.8]],
      [10, [1, 0]],
      [30, [0, 1]],
    ]);
    const ranked = rankSemanticApplications({
      queryVector,
      applications,
      evidenceVectors,
      limit: 2,
    });
    expect(ranked.map((row) => row.applicationId)).toEqual([1, 2]);
    expect(ranked[0]?.supportingEvidenceId).toBe(10);
    expect(ranked[0]?.semanticScore).toBeGreaterThan(ranked[1]?.semanticScore ?? 0);
  });

  it("ignores revoked and superseded evidence even when vectors exist", () => {
    const ranked = rankSemanticApplications({
      queryVector: [1, 0],
      applications: [
        application({
          applicationId: 1,
          candidateId: 1,
          text: "Python",
          revoked: true,
        }),
        application({
          applicationId: 2,
          candidateId: 2,
          text: "Python",
          superseded: true,
        }),
      ],
      evidenceVectors: new Map([
        [10, [1, 0]],
        [20, [1, 0]],
      ]),
      limit: 10,
    });
    expect(ranked).toEqual([]);
    expect(
      collectEligibleEvidence([
        application({
          applicationId: 1,
          candidateId: 1,
          text: "Python",
          revoked: true,
        }),
      ]),
    ).toEqual([]);
  });

  it("does not retrieve empty or missing evidence vectors", () => {
    const ranked = rankSemanticApplications({
      queryVector: [1, 0],
      applications: [
        application({ applicationId: 1, candidateId: 1, text: "" }),
      ],
      evidenceVectors: new Map(),
      limit: 10,
    });
    expect(ranked).toEqual([]);
  });

  it("drops other-company evidence from scoring", () => {
    const foreign = application({
      applicationId: 2,
      candidateId: 2,
      companyId: 2,
      text: "Python",
    });
    const score = scoreSemanticApplication({
      queryVector: [1, 0],
      application: {
        ...application({ applicationId: 1, candidateId: 1, text: "other" }),
        evidence: foreign.evidence,
      },
      evidenceVectors: new Map([[20, [1, 0]]]),
    });
    expect(score.supportingEvidenceId).toBeNull();
  });

  it("keeps the same candidate contextual to the application", () => {
    const pythonApp = application({
      applicationId: 1,
      candidateId: 9,
      jobId: 10,
      text: "Python",
    });
    const javaJobApp = application({
      applicationId: 2,
      candidateId: 9,
      jobId: 11,
      text: "Python",
    });
    const rankedPython = rankSemanticApplications({
      queryVector: [1, 0],
      applications: [pythonApp],
      evidenceVectors: new Map([[10, [1, 0]]]),
      limit: 10,
    });
    const rankedJava = rankSemanticApplications({
      queryVector: [0, 1],
      applications: [javaJobApp],
      evidenceVectors: new Map([[20, [1, 0]]]),
      limit: 10,
    });
    expect(rankedPython.map((row) => row.applicationId)).toEqual([1]);
    expect(rankedJava[0]?.semanticScore ?? 0).toBeLessThan(0.1);
  });

  it("can retrieve React Native for a React query — that is similarity, not equivalence", () => {
    const lexical = rankLexicalApplications({
      query: reactQuery(),
      applications: [
        application({
          applicationId: 1,
          candidateId: 1,
          text: "Shipped a React Native app only.",
        }),
      ],
      limit: 10,
    });
    expect(lexical).toEqual([]);

    const semantic = rankSemanticApplications({
      queryVector: [1, 0],
      applications: [
        application({
          applicationId: 1,
          candidateId: 1,
          evidenceId: 11,
          text: "Shipped a React Native app only.",
        }),
      ],
      evidenceVectors: new Map([[11, [0.97, 0.24]]]),
      limit: 10,
    });
    expect(semantic).toHaveLength(1);
    expect(semantic[0]?.supportingEvidenceId).toBe(11);
    expect(explainSemanticRetrieval(semantic[0]!)).toContain("similarity");
    expect(explainSemanticRetrieval(semantic[0]!)).toContain("not candidate quality");
  });

  it("can retrieve negated Django evidence — matching remains a later layer", () => {
    const semantic = rankSemanticApplications({
      queryVector: [1, 0],
      applications: [
        application({
          applicationId: 1,
          candidateId: 1,
          text: "Python experience, no Django experience.",
        }),
      ],
      evidenceVectors: new Map([[10, [0.9, 0.1]]]),
      limit: 10,
    });
    expect(semantic).toHaveLength(1);
  });

  it("can confuse related-but-distinct technologies", () => {
    const cases = [
      { label: "Java vs JavaScript", vector: [0.86, 0.5] },
      { label: "PostgreSQL vs MySQL", vector: [0.88, 0.47] },
      { label: "Python vs Django", vector: [0.8, 0.6] },
    ];
    for (const testCase of cases) {
      const ranked = rankSemanticApplications({
        queryVector: [1, 0],
        applications: [
          application({
            applicationId: 1,
            candidateId: 1,
            text: testCase.label,
          }),
        ],
        evidenceVectors: new Map([[10, testCase.vector]]),
        limit: 10,
      });
      expect(ranked, testCase.label).toHaveLength(1);
    }
  });
});
