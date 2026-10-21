import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CandidateClaimType,
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  CandidateIntelligenceExtractorType,
  CandidateIntelligenceRunStatus,
  CandidateStatus,
  EvidenceGraphEdgeType,
  EvidenceGraphNodeType,
  JobIntelligenceExtractorType,
  JobIntelligenceRunStatus,
  JobRequirementCategory,
  JobRequirementUncertainty,
  JobSpecificationVersionStatus,
  JobStatus,
  PortalRole,
  RequirementAssessmentRunStatus,
  RequirementSupportState,
} from "@prisma/client";
import { EVIDENCE_GRAPH_NOT_FOUND } from "@/lib/evidence-graph/evidence-graph-errors";
import {
  executeMaterializeEvidenceGraph,
  loadEvidenceGraphPage,
} from "@/lib/evidence-graph/evidence-graph-operations";
import { ONTOLOGY_PROVENANCE, ONTOLOGY_VERSION } from "@/lib/ontology/skill-alias-catalog";
import { prisma } from "@/lib/prisma";
import {
  getEvidenceGraphRunWithEdges,
  listEvidenceGraphRunsForJob,
  listGraphSourceClaims,
  listGraphSourceEvidence,
} from "@/lib/repositories/evidence-graph-repository";
import { isAdminEvidenceGraphRole } from "@/lib/validation/evidence-graph-validation";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `egv1-iso-${process.pid}-${Date.now()}`;

function endpointKey(type: EvidenceGraphNodeType, id: number) {
  return `${type}:${id}`;
}

function tenantOwnedEndpoints(world: TenantWorld) {
  return new Set([
    endpointKey(EvidenceGraphNodeType.EVIDENCE, world.evidenceId),
    endpointKey(EvidenceGraphNodeType.CLAIM, world.claimId),
    endpointKey(EvidenceGraphNodeType.REQUIREMENT, world.requirementId),
    endpointKey(EvidenceGraphNodeType.ASSESSMENT, world.assessmentId),
  ]);
}

type TenantWorld = {
  companyId: number;
  jobId: number;
  specId: number;
  candidateId: number;
  applicationId: number;
  evidenceId: number;
  claimId: number;
  requirementId: number;
  assessmentId: number;
  skillConceptId: number;
};

async function ensurePythonSkill() {
  return prisma.skillConcept.upsert({
    where: {
      ontologyVersion_canonicalKey: {
        ontologyVersion: ONTOLOGY_VERSION,
        canonicalKey: "python",
      },
    },
    update: { active: true },
    create: {
      canonicalKey: "python",
      displayName: "Python",
      ontologyVersion: ONTOLOGY_VERSION,
      provenance: ONTOLOGY_PROVENANCE,
      active: true,
    },
    select: { id: true },
  });
}

async function createTenant(label: string, skillConceptId: number): Promise<TenantWorld> {
  const company = await prisma.company.create({
    data: {
      name: `${MARKER} ${label}`,
      industry: "Verification",
      employees: 2,
      publicSlug: `${MARKER}-${label}`.toLowerCase(),
    },
    select: { id: true },
  });
  const job = await prisma.job.create({
    data: {
      title: `${label} Python role`,
      status: JobStatus.OPEN,
      companyId: company.id,
      primarySkills: "Python",
    },
    select: { id: true },
  });
  const spec = await prisma.jobSpecificationVersion.create({
    data: {
      jobId: job.id,
      versionNumber: 1,
      status: JobSpecificationVersionStatus.PUBLISHED,
      publishedAt: new Date(),
      title: `${label} Python role`,
      primarySkills: "Python",
    },
    select: { id: true },
  });
  await prisma.job.update({
    where: { id: job.id },
    data: { currentPublishedSpecificationVersionId: spec.id },
  });
  const candidate = await prisma.candidate.create({
    data: {
      name: `${label} Candidate`,
      role: "Engineer",
      experienceYears: 4,
      status: CandidateStatus.APPLIED,
      companyId: company.id,
      skills: "should-not-become-evidence",
    },
    select: { id: true },
  });
  const application = await prisma.application.create({
    data: {
      candidateId: candidate.id,
      jobId: job.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  const evidence = await prisma.candidateEvidence.create({
    data: {
      companyId: company.id,
      candidateId: candidate.id,
      applicationId: application.id,
      sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
      origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
      inlineText: "Used Python to ship APIs",
      contentSha256: `${MARKER}-${label}-evidence`,
    },
    select: { id: true },
  });
  const intelRun = await prisma.candidateIntelligenceRun.create({
    data: {
      companyId: company.id,
      candidateId: candidate.id,
      evidenceId: evidence.id,
      status: CandidateIntelligenceRunStatus.COMPLETED,
      extractorType: CandidateIntelligenceExtractorType.DETERMINISTIC_TEXT_V1,
      extractorVersion: "v1",
      modelProvider: "none",
      modelName: "deterministic",
      promptVersion: "v1",
      completedAt: new Date(),
    },
    select: { id: true },
  });
  const claim = await prisma.candidateClaim.create({
    data: {
      companyId: company.id,
      candidateId: candidate.id,
      runId: intelRun.id,
      evidenceId: evidence.id,
      claimType: CandidateClaimType.SKILL,
      value: "Python",
      normalizedValue: "python",
      sourceSpanStart: 5,
      sourceSpanEnd: 11,
    },
    select: { id: true },
  });
  const jobIntel = await prisma.jobIntelligenceRun.create({
    data: {
      companyId: company.id,
      jobId: job.id,
      jobSpecificationVersionId: spec.id,
      status: JobIntelligenceRunStatus.COMPLETED,
      extractorType: JobIntelligenceExtractorType.DETERMINISTIC_SPEC_V1,
      extractorVersion: "v1",
      inputHash: `${MARKER}-${label}-job-intel`,
      completedAt: new Date(),
    },
    select: { id: true },
  });
  const requirement = await prisma.jobRequirement.create({
    data: {
      companyId: company.id,
      runId: jobIntel.id,
      jobId: job.id,
      jobSpecificationVersionId: spec.id,
      stableKey: "primarySkills:python",
      sourceField: "primarySkills",
      sourceText: "Python",
      category: JobRequirementCategory.REQUIRED,
      normalizedValue: "python",
      skillConceptId,
      provenance: "verification-fixture",
      uncertainty: JobRequirementUncertainty.CERTAIN,
    },
    select: { id: true },
  });
  const assessmentRun = await prisma.requirementAssessmentRun.create({
    data: {
      companyId: company.id,
      applicationId: application.id,
      candidateId: candidate.id,
      jobId: job.id,
      jobSpecificationVersionId: spec.id,
      jobIntelligenceRunId: jobIntel.id,
      status: RequirementAssessmentRunStatus.COMPLETED,
      matcherVersion: "v2",
      ontologyVersion: ONTOLOGY_VERSION,
      intelligenceSnapshotHash: `${MARKER}-${label}-v2`,
      completedAt: new Date(),
    },
    select: { id: true },
  });
  const assessment = await prisma.requirementAssessment.create({
    data: {
      companyId: company.id,
      runId: assessmentRun.id,
      applicationId: application.id,
      candidateId: candidate.id,
      jobRequirementId: requirement.id,
      supportState: RequirementSupportState.SUPPORTED,
      method: "exact-skill",
      reasonCode: "EXACT_SKILL_MATCH",
      claimId: claim.id,
      evidenceId: evidence.id,
    },
    select: { id: true },
  });
  return {
    companyId: company.id,
    jobId: job.id,
    specId: spec.id,
    candidateId: candidate.id,
    applicationId: application.id,
    evidenceId: evidence.id,
    claimId: claim.id,
    requirementId: requirement.id,
    assessmentId: assessment.id,
    skillConceptId,
  };
}

async function destroyTenant(companyId: number) {
  await prisma.evidenceGraphEdge.deleteMany({ where: { companyId } });
  await prisma.evidenceGraphRun.deleteMany({ where: { companyId } });
  await prisma.requirementAssessment.deleteMany({ where: { companyId } });
  await prisma.requirementAssessmentRun.deleteMany({ where: { companyId } });
  await prisma.jobRequirement.deleteMany({ where: { companyId } });
  await prisma.jobIntelligenceRun.deleteMany({ where: { companyId } });
  await prisma.candidateClaim.deleteMany({ where: { companyId } });
  await prisma.candidateIntelligenceRun.deleteMany({ where: { companyId } });
  await prisma.candidateEvidence.updateMany({
    where: { companyId },
    data: { supersededById: null },
  });
  await prisma.candidateEvidence.deleteMany({ where: { companyId } });
  await prisma.application.deleteMany({ where: { companyId } });
  const jobs = await prisma.job.findMany({
    where: { companyId },
    select: { id: true },
  });
  for (const job of jobs) {
    await prisma.job.update({
      where: { id: job.id },
      data: { currentPublishedSpecificationVersionId: null },
    });
  }
  await prisma.jobSpecificationVersion.deleteMany({
    where: { jobId: { in: jobs.map((job) => job.id) } },
  });
  await prisma.job.deleteMany({ where: { companyId } });
  await prisma.candidate.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}

describe.skipIf(integrationDatabase.mode === "skip")("evidence graph two-company server-action boundary", () => {
  let companyA: TenantWorld;
  let companyB: TenantWorld;

  beforeAll(async () => {
    const skill = await ensurePythonSkill();
    companyA = await createTenant("alpha", skill.id);
    companyB = await createTenant("bravo", skill.id);
  }, 30_000);

  afterAll(async () => {
    if (companyA) {
      await destroyTenant(companyA.companyId);
    }
    if (companyB) {
      await destroyTenant(companyB.companyId);
    }
  }, 30_000);

  it("materializes each tenant graph only from that tenant's facts", async () => {
    const [runsA, runsB] = await Promise.all([
      executeMaterializeEvidenceGraph({
        jobId: companyA.jobId,
        jobSpecificationVersionId: companyA.specId,
      }),
      executeMaterializeEvidenceGraph({
        jobId: companyB.jobId,
        jobSpecificationVersionId: companyB.specId,
      }),
    ]);

    expect(runsA).toHaveLength(1);
    expect(runsB).toHaveLength(1);
    expect(runsA[0]?.companyId).toBe(companyA.companyId);
    expect(runsB[0]?.companyId).toBe(companyB.companyId);
    expect(runsA[0]?.edges.every((edge) => edge.companyId === companyA.companyId)).toBe(
      true,
    );
    expect(runsB[0]?.edges.every((edge) => edge.companyId === companyB.companyId)).toBe(
      true,
    );

    const aOwned = tenantOwnedEndpoints(companyA);
    const bOwned = tenantOwnedEndpoints(companyB);
    expect(
      runsA[0]?.edges.some(
        (edge) =>
          bOwned.has(endpointKey(edge.fromType, edge.fromId)) ||
          bOwned.has(endpointKey(edge.toType, edge.toId)),
      ),
    ).toBe(false);
    expect(
      runsB[0]?.edges.some(
        (edge) =>
          aOwned.has(endpointKey(edge.fromType, edge.fromId)) ||
          aOwned.has(endpointKey(edge.toType, edge.toId)),
      ),
    ).toBe(false);
    expect(
      runsA[0]?.edges.some(
        (edge) =>
          edge.edgeType === EvidenceGraphEdgeType.EVIDENCE_SUPPORTS_CLAIM &&
          edge.fromId === companyA.evidenceId &&
          edge.toId === companyA.claimId,
      ),
    ).toBe(true);
  }, 30_000);

  it("loads Company A job graph without Company B runs or edges", async () => {
    const pageA = await loadEvidenceGraphPage(companyA.jobId);
    const pageB = await loadEvidenceGraphPage(companyB.jobId);
    expect(pageA.runs.every((run) => run.companyId === companyA.companyId)).toBe(true);
    expect(pageB.runs.every((run) => run.companyId === companyB.companyId)).toBe(true);
    expect(pageA.runs.some((run) => run.companyId === companyB.companyId)).toBe(false);
    expect(pageB.runs.some((run) => run.companyId === companyA.companyId)).toBe(false);
  });

  it("rejects cross-tenant spec/job pairing and ID lookups", async () => {
    await expect(
      executeMaterializeEvidenceGraph({
        jobId: companyA.jobId,
        jobSpecificationVersionId: companyB.specId,
      }),
    ).rejects.toMatchObject({ code: EVIDENCE_GRAPH_NOT_FOUND });

    const [runA] = await listEvidenceGraphRunsForJob(
      companyA.jobId,
      companyA.companyId,
    );
    expect(runA).toBeTruthy();
    expect(
      await listEvidenceGraphRunsForJob(companyA.jobId, companyB.companyId),
    ).toEqual([]);
    expect(
      await getEvidenceGraphRunWithEdges(runA!.id, companyB.companyId),
    ).toBeNull();
    expect(
      await listGraphSourceEvidence({
        companyId: companyA.companyId,
        candidateId: companyB.candidateId,
        applicationId: companyB.applicationId,
      }),
    ).toEqual([]);
    expect(
      await listGraphSourceClaims({
        companyId: companyA.companyId,
        candidateId: companyA.candidateId,
        evidenceIds: [companyB.evidenceId],
      }),
    ).toEqual([]);
    expect(
      await listGraphSourceClaims({
        companyId: companyB.companyId,
        candidateId: companyB.candidateId,
        evidenceIds: [companyA.evidenceId],
      }),
    ).toEqual([]);
  });

  it("keeps historical edges after revoke/supersede and marks them inactive", async () => {
    const before = await loadEvidenceGraphPage(companyA.jobId);
    const beforeEdge = before.runs[0]?.edges.find(
      (edge) =>
        edge.edgeType === EvidenceGraphEdgeType.EVIDENCE_SUPPORTS_CLAIM &&
        edge.sourceEvidenceId === companyA.evidenceId,
    );
    expect(beforeEdge?.evidenceActive).toBe(true);

    await prisma.candidateEvidence.update({
      where: { id: companyA.evidenceId },
      data: { revokedAt: new Date() },
    });
    const revoked = await loadEvidenceGraphPage(companyA.jobId);
    const revokedEdge = revoked.runs[0]?.edges.find(
      (edge) =>
        edge.edgeType === EvidenceGraphEdgeType.EVIDENCE_SUPPORTS_CLAIM &&
        edge.sourceEvidenceId === companyA.evidenceId,
    );
    expect(revokedEdge).toBeTruthy();
    expect(revokedEdge?.id).toBe(beforeEdge?.id);
    expect(revokedEdge?.evidenceActive).toBe(false);

    const replacement = await prisma.candidateEvidence.create({
      data: {
        companyId: companyB.companyId,
        candidateId: companyB.candidateId,
        applicationId: companyB.applicationId,
        sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
        origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
        inlineText: "Replacement",
        contentSha256: `${MARKER}-bravo-replacement`,
      },
      select: { id: true },
    });
    await prisma.candidateEvidence.update({
      where: { id: companyB.evidenceId },
      data: { supersededById: replacement.id },
    });
    const superseded = await loadEvidenceGraphPage(companyB.jobId);
    const supersededEdge = superseded.runs[0]?.edges.find(
      (edge) =>
        edge.edgeType === EvidenceGraphEdgeType.EVIDENCE_SUPPORTS_CLAIM &&
        edge.sourceEvidenceId === companyB.evidenceId,
    );
    expect(supersededEdge).toBeTruthy();
    expect(supersededEdge?.evidenceActive).toBe(false);
  });

  it("keeps graph operations admin-only at the existing role gate", () => {
    expect(isAdminEvidenceGraphRole(PortalRole.ADMIN)).toBe(true);
    expect(isAdminEvidenceGraphRole(PortalRole.CLIENT)).toBe(false);
    expect(isAdminEvidenceGraphRole(PortalRole.INTERVIEWER)).toBe(false);
  });
});
