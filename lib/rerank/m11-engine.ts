import { JobRequirementCategory, RequirementSupportState } from "@prisma/client";

import { M11_RERANK_VERSION } from "@/lib/rerank/m11-versions";

const REQUIRED_SKILL_FIELDS = new Set(["primarySkills", "mustHaveRequirements"]);

export type M11Requirement = {
  id: number;
  companyId: number;
  category: JobRequirementCategory;
  sourceField: string;
  skillConceptId: number | null;
};

export type M11Assessment = {
  id: number;
  companyId: number;
  applicationId: number;
  jobRequirementId: number;
  supportState: RequirementSupportState;
  claimId: number | null;
  evidenceId: number | null;
};

export type M11Candidate = {
  applicationId: number;
  candidateId: number;
  companyId: number;
  m10Rank: number;
  rrfScore: number;
};

export type M11Provenance = {
  requirementId: number;
  assessmentId: number;
  claimId: number | null;
  evidenceId: number | null;
  supportState: RequirementSupportState;
};

export type M11RerankRow = {
  applicationId: number;
  candidateId: number;
  companyId: number;
  m10Rank: number;
  rrfScore: number;
  rerankRank: number;
  contradictedRequiredSkillCount: number;
  supportedRequiredSkillCount: number;
  provenance: M11Provenance[];
  rerankVersion: string;
};

export function isRequiredSkillRequirement(requirement: M11Requirement) {
  if (requirement.category !== JobRequirementCategory.REQUIRED) {
    return false;
  }
  if (requirement.sourceField === "location") {
    return false;
  }
  return requirement.skillConceptId != null || REQUIRED_SKILL_FIELDS.has(requirement.sourceField);
}

export function rerankM10Candidates(input: {
  companyId: number;
  candidates: M11Candidate[];
  requirements: M11Requirement[];
  assessments: M11Assessment[];
}): M11RerankRow[] {
  const requiredIds = new Set(
    input.requirements
      .filter((requirement) => {
        if (requirement.companyId !== input.companyId) {
          throw new Error("Requirement is outside the M10 company.");
        }
        return isRequiredSkillRequirement(requirement);
      })
      .map((requirement) => requirement.id),
  );

  const byApplication = new Map<number, M11Assessment[]>();
  for (const assessment of input.assessments) {
    if (assessment.companyId !== input.companyId) {
      throw new Error("Assessment is outside the M10 company.");
    }
    if (!requiredIds.has(assessment.jobRequirementId)) {
      continue;
    }
    const rows = byApplication.get(assessment.applicationId) ?? [];
    rows.push(assessment);
    byApplication.set(assessment.applicationId, rows);
  }

  const ranked = input.candidates.map((candidate) => {
    if (candidate.companyId !== input.companyId) {
      throw new Error("M10 result is outside the M10 company.");
    }
    const rows = byApplication.get(candidate.applicationId) ?? [];
    const contradicted = rows.filter(
      (row) => row.supportState === RequirementSupportState.CONTRADICTED,
    );
    const supported = rows.filter(
      (row) => row.supportState === RequirementSupportState.SUPPORTED,
    );
    return {
      applicationId: candidate.applicationId,
      candidateId: candidate.candidateId,
      companyId: candidate.companyId,
      m10Rank: candidate.m10Rank,
      rrfScore: candidate.rrfScore,
      rerankRank: 0,
      contradictedRequiredSkillCount: contradicted.length,
      supportedRequiredSkillCount: supported.length,
      provenance: [...contradicted, ...supported].map((row) => ({
        requirementId: row.jobRequirementId,
        assessmentId: row.id,
        claimId: row.claimId,
        evidenceId: row.evidenceId,
        supportState: row.supportState,
      })),
      rerankVersion: M11_RERANK_VERSION,
    };
  });

  ranked.sort((left, right) => {
    if (left.contradictedRequiredSkillCount !== right.contradictedRequiredSkillCount) {
      return left.contradictedRequiredSkillCount - right.contradictedRequiredSkillCount;
    }
    if (left.supportedRequiredSkillCount !== right.supportedRequiredSkillCount) {
      return right.supportedRequiredSkillCount - left.supportedRequiredSkillCount;
    }
    return left.m10Rank - right.m10Rank;
  });

  return ranked.map((row, index) => ({ ...row, rerankRank: index + 1 }));
}
