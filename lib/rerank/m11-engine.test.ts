import { describe, expect, it } from "vitest";
import { JobRequirementCategory, PortalRole, RequirementSupportState } from "@prisma/client";

import {
  isRequiredSkillRequirement,
  rerankM10Candidates,
  type M11Assessment,
  type M11Candidate,
  type M11Requirement,
} from "@/lib/rerank/m11-engine";
import { M11_RERANK_VERSION } from "@/lib/rerank/m11-versions";
import { isAdminM11Role } from "@/lib/validation/m11-validation";

const required = (id: number): M11Requirement => ({
  id,
  companyId: 1,
  category: JobRequirementCategory.REQUIRED,
  sourceField: "primarySkills",
  skillConceptId: id,
});

const candidate = (applicationId: number, m10Rank: number): M11Candidate => ({
  applicationId,
  candidateId: applicationId,
  companyId: 1,
  m10Rank,
  rrfScore: 1 / (60 + m10Rank),
});

function assessment(
  id: number,
  applicationId: number,
  jobRequirementId: number,
  supportState: RequirementSupportState,
  evidenceId: number | null = 10,
): M11Assessment {
  return {
    id,
    companyId: 1,
    applicationId,
    jobRequirementId,
    supportState,
    claimId: evidenceId,
    evidenceId,
  };
}

function order(rows: ReturnType<typeof rerankM10Candidates>) {
  return rows.map((row) => row.applicationId);
}

describe("M11 required-skill rerank", () => {
  it("ranks more supported applications ahead when contradictions are equal", () => {
    const rows = rerankM10Candidates({
      companyId: 1,
      requirements: [required(1), required(2)],
      candidates: [candidate(2, 1), candidate(1, 2)],
      assessments: [
        assessment(1, 1, 1, RequirementSupportState.SUPPORTED),
        assessment(2, 1, 2, RequirementSupportState.SUPPORTED),
        assessment(3, 2, 1, RequirementSupportState.SUPPORTED),
      ],
    });
    expect(order(rows)).toEqual([1, 2]);
    expect(rows[0]?.supportedRequiredSkillCount).toBe(2);
    expect(rows[1]?.supportedRequiredSkillCount).toBe(1);
  });

  it("ranks zero contradictions ahead of one contradiction even with more support", () => {
    const rows = rerankM10Candidates({
      companyId: 1,
      requirements: [required(1), required(2), required(3), required(4), required(5), required(6)],
      candidates: [candidate(2, 1), candidate(1, 2)],
      assessments: [
        assessment(1, 1, 1, RequirementSupportState.SUPPORTED),
        ...[2, 3, 4, 5, 6].map((id) =>
          assessment(id, 2, id, id === 2 ? RequirementSupportState.CONTRADICTED : RequirementSupportState.SUPPORTED),
        ),
      ],
    });
    expect(rows[0]?.applicationId).toBe(1);
    expect(rows[0]?.contradictedRequiredSkillCount).toBe(0);
    expect(rows[1]?.contradictedRequiredSkillCount).toBe(1);
    expect(rows[1]?.supportedRequiredSkillCount).toBe(4);
  });

  it("does not count UNKNOWN or UNSUPPORTED as support or contradiction", () => {
    const rows = rerankM10Candidates({
      companyId: 1,
      requirements: [required(1), required(2)],
      candidates: [candidate(1, 1)],
      assessments: [
        assessment(1, 1, 1, RequirementSupportState.UNKNOWN, null),
        assessment(2, 1, 2, RequirementSupportState.UNSUPPORTED, null),
      ],
    });
    expect(rows[0]?.supportedRequiredSkillCount).toBe(0);
    expect(rows[0]?.contradictedRequiredSkillCount).toBe(0);
  });

  it("breaks otherwise identical tuples by earlier M10 rank", () => {
    const rows = rerankM10Candidates({
      companyId: 1,
      requirements: [required(1)],
      candidates: [candidate(8, 2), candidate(3, 1)],
      assessments: [],
    });
    expect(order(rows)).toEqual([3, 8]);
    expect(rows.map((row) => row.m10Rank)).toEqual([1, 2]);
    expect(rows.map((row) => row.rrfScore)).toEqual([1 / 61, 1 / 62]);
  });

  it("keeps the same application set and records the version", () => {
    const rows = rerankM10Candidates({
      companyId: 1,
      requirements: [required(1)],
      candidates: [candidate(4, 2), candidate(9, 1)],
      assessments: [assessment(1, 4, 1, RequirementSupportState.SUPPORTED)],
    });
    expect(new Set(order(rows))).toEqual(new Set([4, 9]));
    expect(rows.every((row) => row.rerankVersion === M11_RERANK_VERSION)).toBe(true);
    expect(rows.every((row) => !("candidateScore" in row))).toBe(true);
  });

  it("counts a contradicted assessment as contradiction and keeps its provenance", () => {
    const rows = rerankM10Candidates({
      companyId: 1,
      requirements: [required(1)],
      candidates: [candidate(1, 1), candidate(2, 2)],
      assessments: [
        assessment(7, 2, 1, RequirementSupportState.CONTRADICTED, 11),
      ],
    });
    expect(order(rows)).toEqual([1, 2]);
    expect(rows[1]?.provenance).toEqual([
      {
        requirementId: 1,
        assessmentId: 7,
        claimId: 11,
        evidenceId: 11,
        supportState: RequirementSupportState.CONTRADICTED,
      },
    ]);
  });

  it("does not treat a non-required or profile-only row as support", () => {
    expect(
      isRequiredSkillRequirement({
        id: 1,
        companyId: 1,
        category: JobRequirementCategory.PREFERRED,
        sourceField: "niceToHaveRequirements",
        skillConceptId: 1,
      }),
    ).toBe(false);
    expect(
      isRequiredSkillRequirement({
        id: 2,
        companyId: 1,
        category: JobRequirementCategory.REQUIRED,
        sourceField: "location",
        skillConceptId: null,
      }),
    ).toBe(false);
    const rows = rerankM10Candidates({
      companyId: 1,
      requirements: [
        {
          id: 9,
          companyId: 1,
          category: JobRequirementCategory.PREFERRED,
          sourceField: "profileSkills",
          skillConceptId: 9,
        },
      ],
      candidates: [candidate(1, 1)],
      assessments: [assessment(1, 1, 9, RequirementSupportState.SUPPORTED, null)],
    });
    expect(rows[0]?.supportedRequiredSkillCount).toBe(0);
    expect(rows[0]?.provenance).toEqual([]);
  });

  it("does not turn a different canonical requirement into support for another", () => {
    const react = required(1);
    const reactNative = required(2);
    const rows = rerankM10Candidates({
      companyId: 1,
      requirements: [react, reactNative],
      candidates: [candidate(1, 1)],
      assessments: [assessment(1, 1, reactNative.id, RequirementSupportState.SUPPORTED)],
    });
    expect(rows[0]?.supportedRequiredSkillCount).toBe(1);
    expect(rows[0]?.provenance.map((row) => row.requirementId)).toEqual([reactNative.id]);
    expect(rows[0]?.provenance.map((row) => row.requirementId)).not.toContain(react.id);
  });

  it("fails closed when an assessment belongs to another company", () => {
    expect(() =>
      rerankM10Candidates({
        companyId: 1,
        requirements: [required(1)],
        candidates: [candidate(1, 1)],
        assessments: [{ ...assessment(1, 1, 1, RequirementSupportState.SUPPORTED), companyId: 2 }],
      }),
    ).toThrow(/company/);
  });
});

describe("M11 authorization", () => {
  it("allows only admin", () => {
    expect(isAdminM11Role(PortalRole.ADMIN)).toBe(true);
    expect(isAdminM11Role(PortalRole.CLIENT)).toBe(false);
    expect(isAdminM11Role(PortalRole.INTERVIEWER)).toBe(false);
  });
});
