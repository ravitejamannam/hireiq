import { describe, expect, it } from "vitest";
import { JobRequirementCategory } from "@prisma/client";

import { extractJobRequirements } from "@/lib/jobs/intelligence/job-intelligence-extractor";
import {
  assembleLexicalCorpus,
  isEligibleRetrievalEvidence,
  rankLexicalApplications,
  scoreLexicalApplication,
} from "@/lib/retrieval/lexical-engine";
import { buildLexicalQuery } from "@/lib/retrieval/lexical-query";
import { recallAtK, relevantIdsFromJudgments } from "@/lib/retrieval/lexical-retrieval-eval";
import type { LexicalApplicationDocument } from "@/lib/retrieval/lexical-retrieval-types";

function application(input: {
  applicationId: number;
  candidateId: number;
  companyId?: number;
  jobId?: number;
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
        evidenceId: input.applicationId * 10,
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

function pythonJobQuery() {
  const requirements = extractJobRequirements({
    title: "Backend",
    primarySkills: "Python",
    mustHaveRequirements: null,
    niceToHaveRequirements: null,
    location: null,
    experienceRange: null,
    jobDescription: "We are a kind team that values curiosity and collaboration daily.",
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

describe("lexical retrieval engine", () => {
  it("retrieves exact skill overlap ahead of an unrelated application", () => {
    const query = pythonJobQuery();
    const ranked = rankLexicalApplications({
      query,
      applications: [
        application({
          applicationId: 2,
          candidateId: 2,
          text: "Java backend development",
        }),
        application({
          applicationId: 1,
          candidateId: 1,
          text: "Python backend development",
        }),
      ],
      limit: 10,
    });

    expect(ranked.map((row) => row.applicationId)).toEqual([1]);
    expect(ranked[0]?.matchedTerms).toEqual(["python"]);
  });

  it("respects JS → javascript alias overlap", () => {
    const requirements = extractJobRequirements({
      title: "Frontend",
      primarySkills: "JavaScript",
      mustHaveRequirements: null,
      niceToHaveRequirements: null,
      location: null,
      experienceRange: null,
      jobDescription: null,
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
    const ranked = rankLexicalApplications({
      query,
      applications: [
        application({ applicationId: 1, candidateId: 1, text: "Built UI in JS." }),
      ],
      limit: 10,
    });
    expect(ranked[0]?.matchedTerms).toEqual(["javascript"]);
  });

  it("does not treat React Native-only evidence as React", () => {
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
    const query = buildLexicalQuery(
      requirements.map((row) => ({
        sourceField: row.sourceField,
        sourceText: row.sourceText,
        category: row.category,
        normalizedValue: row.normalizedValue,
        skillCanonicalKey: row.skillCanonicalKey,
      })),
    );
    const ranked = rankLexicalApplications({
      query,
      applications: [
        application({
          applicationId: 1,
          candidateId: 1,
          text: "Shipped a React Native app only.",
        }),
      ],
      limit: 10,
    });
    expect(ranked).toEqual([]);
  });

  it("does not retrieve Django from a negated mention", () => {
    const requirements = extractJobRequirements({
      title: "Backend",
      primarySkills: "Django",
      mustHaveRequirements: null,
      niceToHaveRequirements: null,
      location: null,
      experienceRange: null,
      jobDescription: null,
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
    const ranked = rankLexicalApplications({
      query,
      applications: [
        application({
          applicationId: 1,
          candidateId: 1,
          text: "Python experience, no Django experience.",
        }),
      ],
      limit: 10,
    });
    expect(ranked).toEqual([]);
  });

  it("does not increase score for keyword stuffing of the same term", () => {
    const query = pythonJobQuery();
    const stuffed = scoreLexicalApplication({
      query,
      application: application({
        applicationId: 1,
        candidateId: 1,
        text: "Python Python Python Python Python Python",
      }),
    });
    const contextual = scoreLexicalApplication({
      query,
      application: application({
        applicationId: 2,
        candidateId: 2,
        text: "Designed Python backend services.",
      }),
    });
    expect(stuffed.lexicalScore).toBe(contextual.lexicalScore);
    expect(stuffed.lexicalScore).toBe(1);
  });

  it("does not invent a match from missing evidence", () => {
    const ranked = rankLexicalApplications({
      query: pythonJobQuery(),
      applications: [
        application({ applicationId: 1, candidateId: 1, text: "Hello." }),
      ],
      limit: 10,
    });
    expect(ranked).toEqual([]);
  });

  it("ignores revoked and superseded evidence", () => {
    expect(
      isEligibleRetrievalEvidence({ revokedAt: new Date(), supersededById: null }),
    ).toBe(false);
    expect(
      isEligibleRetrievalEvidence({ revokedAt: null, supersededById: 3 }),
    ).toBe(false);

    const query = pythonJobQuery();
    const ranked = rankLexicalApplications({
      query,
      applications: [
        application({
          applicationId: 1,
          candidateId: 1,
          text: "Python backend",
          revoked: true,
        }),
        application({
          applicationId: 2,
          candidateId: 2,
          text: "Python backend",
          superseded: true,
        }),
      ],
      limit: 10,
    });
    expect(ranked).toEqual([]);
  });

  it("drops other-company applications and evidence from the corpus", () => {
    const corpus = assembleLexicalCorpus({
      companyId: 1,
      jobId: 10,
      applications: [
        { id: 1, candidateId: 1, companyId: 1, jobId: 10 },
        { id: 2, candidateId: 2, companyId: 2, jobId: 10 },
        { id: 3, candidateId: 3, companyId: 1, jobId: 99 },
      ],
      evidence: [
        {
          evidenceId: 1,
          applicationId: 1,
          candidateId: 1,
          companyId: 1,
          inlineText: "Python",
          contentSha256: "a",
          revokedAt: null,
          supersededById: null,
        },
        {
          evidenceId: 2,
          applicationId: 2,
          candidateId: 2,
          companyId: 2,
          inlineText: "Python",
          contentSha256: "b",
          revokedAt: null,
          supersededById: null,
        },
      ],
    });

    expect(corpus.map((row) => row.applicationId)).toEqual([1]);
    expect(corpus[0]?.evidence).toHaveLength(1);
    expect(corpus[0]?.evidence[0]?.companyId).toBe(1);
  });

  it("keeps the same candidate contextual to the application/job", () => {
    const query = pythonJobQuery();
    const rankedJobA = rankLexicalApplications({
      query,
      applications: [
        application({
          applicationId: 1,
          candidateId: 9,
          jobId: 10,
          text: "Python backend",
        }),
      ],
      limit: 10,
    });
    const rankedJobB = rankLexicalApplications({
      query: buildLexicalQuery([
        {
          sourceField: "primarySkills",
          sourceText: "Java",
          category: JobRequirementCategory.REQUIRED,
          normalizedValue: "java",
          skillCanonicalKey: "java",
        },
      ]),
      applications: [
        application({
          applicationId: 2,
          candidateId: 9,
          jobId: 11,
          text: "Python backend",
        }),
      ],
      limit: 10,
    });

    expect(rankedJobA.map((row) => row.applicationId)).toEqual([1]);
    expect(rankedJobB).toEqual([]);
  });

  it("does not use a raw JD dump as the only query source", () => {
    const query = pythonJobQuery();
    expect(query.terms.every((term) => term.kind !== "SKILL" || term.key === "python")).toBe(
      true,
    );
    expect(query.terms.some((term) => term.key.includes("curiosity"))).toBe(false);
  });

  it("computes synthetic Recall@K without treating labels as recruiter outcomes", () => {
    const judgments = [
      {
        datasetLabel: "SYNTHETIC_NOT_RECRUITER_OUTCOMES" as const,
        applicationId: 1,
        label: "STRONGLY_RELEVANT" as const,
      },
      {
        datasetLabel: "SYNTHETIC_NOT_RECRUITER_OUTCOMES" as const,
        applicationId: 2,
        label: "NOT_RELEVANT" as const,
      },
    ];
    const relevant = relevantIdsFromJudgments(judgments);
    expect(recallAtK(relevant, [1, 2], 10)).toBe(1);
    expect(recallAtK(relevant, [2], 10)).toBe(0);
  });
});
