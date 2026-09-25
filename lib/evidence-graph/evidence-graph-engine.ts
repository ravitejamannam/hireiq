import { createHash } from "node:crypto";

import {
  EvidenceGraphEdgeType,
  EvidenceGraphNodeType,
} from "@prisma/client";

import type {
  EvidenceGraphBuildInput,
  EvidenceGraphEdgeDraft,
} from "@/lib/evidence-graph/evidence-graph-types";

export function isActiveEvidence(evidence: {
  revokedAt: Date | null;
  supersededById: number | null;
}) {
  return evidence.revokedAt == null && evidence.supersededById == null;
}

export function edgeKey(edge: Pick<
  EvidenceGraphEdgeDraft,
  "edgeType" | "fromType" | "fromId" | "toType" | "toId"
>) {
  return `${edge.edgeType}:${edge.fromType}:${edge.fromId}:${edge.toType}:${edge.toId}`;
}

function sameCompany(companyId: number, rowCompanyId: number) {
  return rowCompanyId === companyId;
}

export function buildEvidenceGraphEdges(
  input: EvidenceGraphBuildInput,
): EvidenceGraphEdgeDraft[] {
  void input.profileSkills;
  const edges = new Map<string, EvidenceGraphEdgeDraft>();

  const evidenceById = new Map(
    input.evidence
      .filter((row) => sameCompany(input.companyId, row.companyId))
      .map((row) => [row.evidenceId, row] as const),
  );
  const claims = input.claims.filter(
    (row) =>
      sameCompany(input.companyId, row.companyId) &&
      row.candidateId === input.candidateId &&
      evidenceById.has(row.evidenceId),
  );
  const requirements = input.requirements.filter(
    (row) =>
      sameCompany(input.companyId, row.companyId) &&
      row.jobSpecificationVersionId === input.jobSpecificationVersionId,
  );
  const skills = input.skills.filter(
    (row) => row.ontologyVersion === input.ontologyVersion,
  );
  const skillByKey = new Map(skills.map((row) => [row.canonicalKey, row] as const));
  const skillById = new Map(skills.map((row) => [row.skillConceptId, row] as const));
  const assessments = input.assessments.filter((row) =>
    sameCompany(input.companyId, row.companyId),
  );

  function add(edge: EvidenceGraphEdgeDraft) {
    if (edge.companyId !== input.companyId) {
      return;
    }
    edges.set(edgeKey(edge), edge);
  }

  for (const claim of claims) {
    add({
      companyId: input.companyId,
      edgeType: EvidenceGraphEdgeType.EVIDENCE_SUPPORTS_CLAIM,
      fromType: EvidenceGraphNodeType.EVIDENCE,
      fromId: claim.evidenceId,
      toType: EvidenceGraphNodeType.CLAIM,
      toId: claim.claimId,
      provenance: `candidate_claim#${claim.claimId}.evidenceId`,
      sourceEvidenceId: claim.evidenceId,
      sourceClaimId: claim.claimId,
      sourceRequirementId: null,
      sourceAssessmentId: null,
      ontologyVersion: null,
      jobSpecificationVersionId: null,
    });

    if (claim.claimType === "SKILL" && claim.normalizedValue) {
      const skill = skillByKey.get(claim.normalizedValue);
      if (skill) {
        add({
          companyId: input.companyId,
          edgeType: EvidenceGraphEdgeType.CLAIM_MAPS_TO_SKILL,
          fromType: EvidenceGraphNodeType.CLAIM,
          fromId: claim.claimId,
          toType: EvidenceGraphNodeType.SKILL,
          toId: skill.skillConceptId,
          provenance: `candidate_claim#${claim.claimId}.normalizedValue=${claim.normalizedValue}`,
          sourceEvidenceId: claim.evidenceId,
          sourceClaimId: claim.claimId,
          sourceRequirementId: null,
          sourceAssessmentId: null,
          ontologyVersion: input.ontologyVersion,
          jobSpecificationVersionId: null,
        });
      }
    }
  }

  for (const requirement of requirements) {
    if (requirement.skillConceptId == null) {
      continue;
    }
    const skill = skillById.get(requirement.skillConceptId);
    if (!skill) {
      continue;
    }
    add({
      companyId: input.companyId,
      edgeType: EvidenceGraphEdgeType.REQUIREMENT_REQUIRES_SKILL,
      fromType: EvidenceGraphNodeType.REQUIREMENT,
      fromId: requirement.requirementId,
      toType: EvidenceGraphNodeType.SKILL,
      toId: skill.skillConceptId,
      provenance: `job_requirement#${requirement.requirementId}.skillConceptId`,
      sourceEvidenceId: null,
      sourceClaimId: null,
      sourceRequirementId: requirement.requirementId,
      sourceAssessmentId: null,
      ontologyVersion: input.ontologyVersion,
      jobSpecificationVersionId: input.jobSpecificationVersionId,
    });
  }

  for (const assessment of assessments) {
    if (assessment.evidenceId != null && evidenceById.has(assessment.evidenceId)) {
      add({
        companyId: input.companyId,
        edgeType: EvidenceGraphEdgeType.ASSESSMENT_CITES_EVIDENCE,
        fromType: EvidenceGraphNodeType.ASSESSMENT,
        fromId: assessment.assessmentId,
        toType: EvidenceGraphNodeType.EVIDENCE,
        toId: assessment.evidenceId,
        provenance: `requirement_assessment#${assessment.assessmentId}.evidenceId`,
        sourceEvidenceId: assessment.evidenceId,
        sourceClaimId: assessment.claimId,
        sourceRequirementId: assessment.jobRequirementId,
        sourceAssessmentId: assessment.assessmentId,
        ontologyVersion: null,
        jobSpecificationVersionId: input.jobSpecificationVersionId,
      });
    }
    if (assessment.claimId != null) {
      const claim = claims.find((row) => row.claimId === assessment.claimId);
      if (claim) {
        add({
          companyId: input.companyId,
          edgeType: EvidenceGraphEdgeType.ASSESSMENT_CITES_CLAIM,
          fromType: EvidenceGraphNodeType.ASSESSMENT,
          fromId: assessment.assessmentId,
          toType: EvidenceGraphNodeType.CLAIM,
          toId: claim.claimId,
          provenance: `requirement_assessment#${assessment.assessmentId}.claimId`,
          sourceEvidenceId: claim.evidenceId,
          sourceClaimId: claim.claimId,
          sourceRequirementId: assessment.jobRequirementId,
          sourceAssessmentId: assessment.assessmentId,
          ontologyVersion: null,
          jobSpecificationVersionId: input.jobSpecificationVersionId,
        });
        add({
          companyId: input.companyId,
          edgeType: EvidenceGraphEdgeType.CLAIM_CITED_FOR_REQUIREMENT,
          fromType: EvidenceGraphNodeType.CLAIM,
          fromId: claim.claimId,
          toType: EvidenceGraphNodeType.REQUIREMENT,
          toId: assessment.jobRequirementId,
          provenance: `requirement_assessment#${assessment.assessmentId} ${assessment.supportState}`,
          sourceEvidenceId: claim.evidenceId,
          sourceClaimId: claim.claimId,
          sourceRequirementId: assessment.jobRequirementId,
          sourceAssessmentId: assessment.assessmentId,
          ontologyVersion: input.ontologyVersion,
          jobSpecificationVersionId: input.jobSpecificationVersionId,
        });
      }
    }
  }

  return [...edges.values()].sort((left, right) =>
    edgeKey(left).localeCompare(edgeKey(right)),
  );
}

export function hashEvidenceGraphSnapshot(input: {
  evidenceIds: number[];
  claimIds: number[];
  requirementIds: number[];
  assessmentIds: number[];
  skillIds: number[];
}) {
  const lines = [
    `e:${[...input.evidenceIds].sort((a, b) => a - b).join(",")}`,
    `c:${[...input.claimIds].sort((a, b) => a - b).join(",")}`,
    `r:${[...input.requirementIds].sort((a, b) => a - b).join(",")}`,
    `a:${[...input.assessmentIds].sort((a, b) => a - b).join(",")}`,
    `s:${[...input.skillIds].sort((a, b) => a - b).join(",")}`,
  ];
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

export function annotateEdgeActivity(
  edges: EvidenceGraphEdgeDraft[],
  evidence: Array<{
    evidenceId: number;
    revokedAt: Date | null;
    supersededById: number | null;
  }>,
) {
  const byId = new Map(evidence.map((row) => [row.evidenceId, row] as const));
  return edges.map((edge) => {
    const source = edge.sourceEvidenceId
      ? byId.get(edge.sourceEvidenceId)
      : undefined;
    return {
      ...edge,
      evidenceActive: source ? isActiveEvidence(source) : true,
    };
  });
}
