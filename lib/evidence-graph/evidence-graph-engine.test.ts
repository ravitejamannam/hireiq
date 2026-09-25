import { describe, expect, it } from "vitest";
import {
  EvidenceGraphEdgeType,
  EvidenceGraphNodeType,
} from "@prisma/client";

import {
  annotateEdgeActivity,
  buildEvidenceGraphEdges,
  edgeKey,
  hashEvidenceGraphSnapshot,
  isActiveEvidence,
} from "@/lib/evidence-graph/evidence-graph-engine";
import type { EvidenceGraphBuildInput } from "@/lib/evidence-graph/evidence-graph-types";

function baseInput(
  overrides: Partial<EvidenceGraphBuildInput> = {},
): EvidenceGraphBuildInput {
  return {
    companyId: 1,
    applicationId: 10,
    candidateId: 100,
    jobSpecificationVersionId: 50,
    ontologyVersion: "v1",
    evidence: [
      {
        evidenceId: 1000,
        companyId: 1,
        candidateId: 100,
        revokedAt: null,
        supersededById: null,
      },
    ],
    claims: [
      {
        claimId: 2000,
        companyId: 1,
        candidateId: 100,
        evidenceId: 1000,
        claimType: "SKILL",
        normalizedValue: "python",
        sourceSpanStart: 12,
        sourceSpanEnd: 18,
      },
    ],
    requirements: [
      {
        requirementId: 3000,
        companyId: 1,
        jobSpecificationVersionId: 50,
        skillConceptId: 4000,
        skillCanonicalKey: "python",
      },
    ],
    skills: [
      {
        skillConceptId: 4000,
        canonicalKey: "python",
        ontologyVersion: "v1",
      },
    ],
    assessments: [
      {
        assessmentId: 5000,
        companyId: 1,
        jobRequirementId: 3000,
        claimId: 2000,
        evidenceId: 1000,
        supportState: "SUPPORTED",
      },
    ],
    profileSkills: "java,golang,hidden-profile-skill",
    ...overrides,
  };
}

describe("candidate evidence graph V1", () => {
  it("builds the evidence → claim → requirement → assessment path with provenance", () => {
    const edges = buildEvidenceGraphEdges(baseInput());
    const types = edges.map((edge) => edge.edgeType);

    expect(types).toEqual(
      expect.arrayContaining([
        EvidenceGraphEdgeType.EVIDENCE_SUPPORTS_CLAIM,
        EvidenceGraphEdgeType.CLAIM_MAPS_TO_SKILL,
        EvidenceGraphEdgeType.REQUIREMENT_REQUIRES_SKILL,
        EvidenceGraphEdgeType.CLAIM_CITED_FOR_REQUIREMENT,
        EvidenceGraphEdgeType.ASSESSMENT_CITES_EVIDENCE,
        EvidenceGraphEdgeType.ASSESSMENT_CITES_CLAIM,
      ]),
    );

    const supports = edges.find(
      (edge) => edge.edgeType === EvidenceGraphEdgeType.EVIDENCE_SUPPORTS_CLAIM,
    );
    expect(supports).toMatchObject({
      fromType: EvidenceGraphNodeType.EVIDENCE,
      fromId: 1000,
      toType: EvidenceGraphNodeType.CLAIM,
      toId: 2000,
      sourceEvidenceId: 1000,
      sourceClaimId: 2000,
      provenance: "candidate_claim#2000.evidenceId",
    });

    const cited = edges.find(
      (edge) => edge.edgeType === EvidenceGraphEdgeType.CLAIM_CITED_FOR_REQUIREMENT,
    );
    expect(cited).toMatchObject({
      fromId: 2000,
      toId: 3000,
      sourceAssessmentId: 5000,
      sourceEvidenceId: 1000,
      jobSpecificationVersionId: 50,
      ontologyVersion: "v1",
    });
    expect(cited?.provenance).toContain("requirement_assessment#5000");
  });

  it("is deterministic and idempotent for the same input", () => {
    const first = buildEvidenceGraphEdges(baseInput());
    const second = buildEvidenceGraphEdges(baseInput());
    expect(second).toEqual(first);
    expect(new Set(first.map(edgeKey)).size).toBe(first.length);
  });

  it("does not emit another candidate's claims even in the same company", () => {
    const edges = buildEvidenceGraphEdges(
      baseInput({
        claims: [
          {
            claimId: 2000,
            companyId: 1,
            candidateId: 100,
            evidenceId: 1000,
            claimType: "SKILL",
            normalizedValue: "python",
            sourceSpanStart: 0,
            sourceSpanEnd: 6,
          },
          {
            claimId: 2800,
            companyId: 1,
            candidateId: 101,
            evidenceId: 1000,
            claimType: "SKILL",
            normalizedValue: "python",
            sourceSpanStart: 0,
            sourceSpanEnd: 6,
          },
        ],
      }),
    );
    expect(edges.some((edge) => edge.fromId === 2800 || edge.toId === 2800)).toBe(
      false,
    );
  });

  it("does not emit Company B evidence, claims, assessments, or requirements", () => {
    const edges = buildEvidenceGraphEdges(
      baseInput({
        evidence: [
          {
            evidenceId: 1000,
            companyId: 1,
            candidateId: 100,
            revokedAt: null,
            supersededById: null,
          },
          {
            evidenceId: 1999,
            companyId: 2,
            candidateId: 999,
            revokedAt: null,
            supersededById: null,
          },
        ],
        claims: [
          {
            claimId: 2000,
            companyId: 1,
            candidateId: 100,
            evidenceId: 1000,
            claimType: "SKILL",
            normalizedValue: "python",
            sourceSpanStart: 0,
            sourceSpanEnd: 6,
          },
          {
            claimId: 2999,
            companyId: 2,
            candidateId: 999,
            evidenceId: 1999,
            claimType: "SKILL",
            normalizedValue: "python",
            sourceSpanStart: 0,
            sourceSpanEnd: 6,
          },
        ],
        requirements: [
          {
            requirementId: 3000,
            companyId: 1,
            jobSpecificationVersionId: 50,
            skillConceptId: 4000,
            skillCanonicalKey: "python",
          },
          {
            requirementId: 3999,
            companyId: 2,
            jobSpecificationVersionId: 50,
            skillConceptId: 4000,
            skillCanonicalKey: "python",
          },
        ],
        assessments: [
          {
            assessmentId: 5000,
            companyId: 1,
            jobRequirementId: 3000,
            claimId: 2000,
            evidenceId: 1000,
            supportState: "SUPPORTED",
          },
          {
            assessmentId: 5999,
            companyId: 2,
            jobRequirementId: 3999,
            claimId: 2999,
            evidenceId: 1999,
            supportState: "SUPPORTED",
          },
        ],
      }),
    );

    expect(edges.every((edge) => edge.companyId === 1)).toBe(true);
    expect(edges.some((edge) => [1999, 2999, 3999, 5999].includes(edge.fromId))).toBe(
      false,
    );
    expect(edges.some((edge) => [1999, 2999, 3999, 5999].includes(edge.toId))).toBe(
      false,
    );
  });

  it("keeps revoked and superseded evidence as historical edges, inactive at read time", () => {
    const revoked = {
      evidenceId: 1000,
      companyId: 1,
      candidateId: 100,
      revokedAt: new Date("2026-09-01T00:00:00.000Z"),
      supersededById: null,
    };
    const superseded = {
      evidenceId: 1001,
      companyId: 1,
      candidateId: 100,
      revokedAt: null,
      supersededById: 1002,
    };
    const edges = buildEvidenceGraphEdges(
      baseInput({
        evidence: [revoked, superseded],
        claims: [
          {
            claimId: 2000,
            companyId: 1,
            candidateId: 100,
            evidenceId: 1000,
            claimType: "SKILL",
            normalizedValue: "python",
            sourceSpanStart: 0,
            sourceSpanEnd: 6,
          },
          {
            claimId: 2001,
            companyId: 1,
            candidateId: 100,
            evidenceId: 1001,
            claimType: "SKILL",
            normalizedValue: "django",
            sourceSpanStart: 7,
            sourceSpanEnd: 13,
          },
        ],
        assessments: [],
      }),
    );
    expect(
      edges.filter(
        (edge) => edge.edgeType === EvidenceGraphEdgeType.EVIDENCE_SUPPORTS_CLAIM,
      ),
    ).toHaveLength(2);
    expect(isActiveEvidence(revoked)).toBe(false);
    expect(isActiveEvidence(superseded)).toBe(false);
    const annotated = annotateEdgeActivity(edges, [revoked, superseded]);
    expect(
      annotated
        .filter((edge) => edge.sourceEvidenceId != null)
        .every((edge) => edge.evidenceActive === false),
    ).toBe(true);
  });

  it("does not treat CandidateProfile skills as evidence or claims", () => {
    const edges = buildEvidenceGraphEdges(
      baseInput({
        evidence: [],
        claims: [],
        assessments: [],
        profileSkills: "python,react,django",
      }),
    );
    expect(edges.filter((edge) => edge.edgeType !== EvidenceGraphEdgeType.REQUIREMENT_REQUIRES_SKILL)).toEqual([]);
    expect(
      edges.some((edge) => edge.edgeType === EvidenceGraphEdgeType.EVIDENCE_SUPPORTS_CLAIM),
    ).toBe(false);
    expect(
      edges.some((edge) => edge.edgeType === EvidenceGraphEdgeType.CLAIM_MAPS_TO_SKILL),
    ).toBe(false);
  });

  it("preserves source citation spans on claims without inventing extra text", () => {
    const claim = baseInput().claims[0];
    expect(claim?.sourceSpanStart).toBe(12);
    expect(claim?.sourceSpanEnd).toBe(18);
    const edges = buildEvidenceGraphEdges(baseInput());
    expect(edges.every((edge) => !edge.provenance.includes("java,golang"))).toBe(true);
  });

  it("does not create CLAIM_CITED_FOR_REQUIREMENT for UNKNOWN without a claim citation", () => {
    const edges = buildEvidenceGraphEdges(
      baseInput({
        assessments: [
          {
            assessmentId: 5001,
            companyId: 1,
            jobRequirementId: 3000,
            claimId: null,
            evidenceId: null,
            supportState: "UNKNOWN",
          },
        ],
      }),
    );
    expect(
      edges.some(
        (edge) => edge.edgeType === EvidenceGraphEdgeType.CLAIM_CITED_FOR_REQUIREMENT,
      ),
    ).toBe(false);
    expect(
      edges.some(
        (edge) => edge.edgeType === EvidenceGraphEdgeType.ASSESSMENT_CITES_CLAIM,
      ),
    ).toBe(false);
    expect(
      JSON.stringify(edges).includes("FALSE") ||
        JSON.stringify(edges).includes("NOT_SATISFIED"),
    ).toBe(false);
  });

  it("pins skill and requirement edges to the supplied ontology and spec versions", () => {
    const v1 = buildEvidenceGraphEdges(baseInput());
    const v2 = buildEvidenceGraphEdges(
      baseInput({
        ontologyVersion: "v2",
        jobSpecificationVersionId: 51,
        requirements: [
          {
            requirementId: 3000,
            companyId: 1,
            jobSpecificationVersionId: 51,
            skillConceptId: 4000,
            skillCanonicalKey: "python",
          },
        ],
        skills: [
          {
            skillConceptId: 4000,
            canonicalKey: "python",
            ontologyVersion: "v1",
          },
        ],
      }),
    );
    expect(
      v1.some((edge) => edge.edgeType === EvidenceGraphEdgeType.CLAIM_MAPS_TO_SKILL),
    ).toBe(true);
    expect(
      v2.some((edge) => edge.edgeType === EvidenceGraphEdgeType.CLAIM_MAPS_TO_SKILL),
    ).toBe(false);
    expect(
      v2.some((edge) => edge.edgeType === EvidenceGraphEdgeType.REQUIREMENT_REQUIRES_SKILL),
    ).toBe(false);
    expect(
      hashEvidenceGraphSnapshot({
        evidenceIds: [1],
        claimIds: [2],
        requirementIds: [3],
        assessmentIds: [4],
        skillIds: [5],
      }),
    ).toBe(
      hashEvidenceGraphSnapshot({
        evidenceIds: [1],
        claimIds: [2],
        requirementIds: [3],
        assessmentIds: [4],
        skillIds: [5],
      }),
    );
  });

  it("deduplicates repeated source rows", () => {
    const input = baseInput();
    const edges = buildEvidenceGraphEdges({
      ...input,
      claims: [...input.claims, ...input.claims],
      assessments: [...input.assessments, ...input.assessments],
    });
    expect(new Set(edges.map(edgeKey)).size).toBe(edges.length);
  });
});
