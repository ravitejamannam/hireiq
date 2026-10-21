import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  InterviewerCategory,
  JobSpecificationVersionStatus,
  JobStatus,
  PortalRole,
  RequirementLifecycle,
} from "@prisma/client";
import {
  getInterviewRubric,
  loadRubricScores,
} from "@/app/actions/blueprint-actions";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));




const MARKER = `rubric-${process.pid}-${Date.now()}`;
const SECRET_SCORE = `${MARKER} private score`;
const SECRET_QUESTION = `${MARKER} private question`;

function asUser(id: number) {
  actor.id = String(id);
}

describe.skipIf(integrationDatabase.mode === "skip")("interviewer blueprint reads", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.evaluationCompetencyScore.deleteMany({
      where: { evaluation: { application: { companyId: { in: companyIds } } } },
    });
    await prisma.evaluation.deleteMany({
      where: { application: { companyId: { in: companyIds } } },
    });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.blueprintQuestion.deleteMany({
      where: { blueprint: { specification: { job: { companyId: { in: companyIds } } } } },
    });
    await prisma.blueprintCompetency.deleteMany({
      where: { blueprint: { specification: { job: { companyId: { in: companyIds } } } } },
    });
    await prisma.interviewBlueprint.deleteMany({
      where: { specification: { job: { companyId: { in: companyIds } } } },
    });
    await prisma.job.updateMany({
      where: { companyId: { in: companyIds } },
      data: { currentPublishedSpecificationVersionId: null },
    });
    await prisma.jobSpecificationVersion.deleteMany({
      where: { job: { companyId: { in: companyIds } } },
    });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.interviewer.deleteMany({ where: { id: { in: interviewerIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("keeps rubric scores and interview rubrics on the assigned job", async () => {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} co`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id);

    const interviewerA = await prisma.interviewer.create({
      data: { name: `${MARKER} a`, category: InterviewerCategory.ENGINEERING },
    });
    const interviewerB = await prisma.interviewer.create({
      data: { name: `${MARKER} b`, category: InterviewerCategory.ENGINEERING },
    });
    interviewerIds.push(interviewerA.id, interviewerB.id);

    async function user(label: string, role: PortalRole, interviewerId: number | null) {
      const created = await prisma.user.create({
        data: {
          email: `${MARKER}-${label}@hireiq.test`.toLowerCase(),
          name: label,
          role,
          passwordHash: "not-a-login",
          emailVerifiedAt: new Date(),
          companyId: role === PortalRole.CLIENT ? company.id : null,
          interviewerId,
        },
      });
      userIds.push(created.id);
      return created.id;
    }

    const userA = await user("iv-a", PortalRole.INTERVIEWER, interviewerA.id);
    const userB = await user("iv-b", PortalRole.INTERVIEWER, interviewerB.id);
    const client = await user("client", PortalRole.CLIENT, null);
    const admin = await user("admin", PortalRole.ADMIN, null);
    await prisma.organizationMember.create({
      data: { userId: client, companyId: company.id, role: "OWNER", status: "ACTIVE" },
    });

    const job = await prisma.job.create({
      data: {
        title: `${MARKER} role`,
        status: JobStatus.OPEN,
        companyId: company.id,
        requirementLifecycle: RequirementLifecycle.SOURCING_SHORTLISTING,
        assignedInterviewerId: interviewerA.id,
      },
    });
    const otherJob = await prisma.job.create({
      data: {
        title: `${MARKER} other`,
        status: JobStatus.OPEN,
        companyId: company.id,
        requirementLifecycle: RequirementLifecycle.SOURCING_SHORTLISTING,
        assignedInterviewerId: interviewerB.id,
      },
    });
    const spec = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: job.id,
        versionNumber: 1,
        status: JobSpecificationVersionStatus.PUBLISHED,
        publishedAt: new Date(),
        title: `${MARKER} role`,
      },
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { currentPublishedSpecificationVersionId: spec.id },
    });
    const blueprint = await prisma.interviewBlueprint.create({
      data: { jobSpecificationVersionId: spec.id },
    });
    const competency = await prisma.blueprintCompetency.create({
      data: { blueprintId: blueprint.id, name: "Delivery", weight: 100 },
    });
    await prisma.blueprintQuestion.create({
      data: {
        blueprintId: blueprint.id,
        competencyId: competency.id,
        question: SECRET_QUESTION,
      },
    });

    const candidate = await prisma.candidate.create({
      data: {
        name: `${MARKER} candidate`,
        role: "Engineer",
        experienceYears: 2,
        status: CandidateStatus.APPLIED,
        companyId: company.id,
      },
    });
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: company.id,
        status: ApplicationPipelineStatus.TECH_EVALUATION,
      },
    });
    const evaluation = await prisma.evaluation.create({
      data: {
        applicationId: application.id,
        interviewerId: interviewerA.id,
        notes: SECRET_SCORE,
      },
    });
    await prisma.evaluationCompetencyScore.create({
      data: {
        evaluationId: evaluation.id,
        competencyName: "Delivery",
        weightSnapshot: 100,
        score: 4,
        notes: SECRET_SCORE,
      },
    });

    asUser(userA);
    const scores = await loadRubricScores(evaluation.id);
    expect(scores.ok).toBe(true);
    if (scores.ok) {
      expect(scores.scores.map((row) => row.notes)).toContain(SECRET_SCORE);
    }
    const rubric = await getInterviewRubric(application.id);
    expect(rubric.ok).toBe(true);
    if (rubric.ok) {
      expect(JSON.stringify(rubric.blueprint)).toContain(SECRET_QUESTION);
    }

    asUser(userB);
    const deniedScores = await loadRubricScores(evaluation.id);
    expect(deniedScores.ok).toBe(false);
    expect(JSON.stringify(deniedScores)).not.toContain(SECRET_SCORE);
    const deniedRubric = await getInterviewRubric(application.id);
    expect(deniedRubric.ok).toBe(false);
    expect(JSON.stringify(deniedRubric)).not.toContain(SECRET_QUESTION);

    for (const outsider of [client, admin]) {
      asUser(outsider);
      expect((await loadRubricScores(evaluation.id)).ok).toBe(false);
      expect((await getInterviewRubric(application.id)).ok).toBe(false);
    }

    expect(
      (await prisma.evaluationCompetencyScore.findFirst({
        where: { evaluationId: evaluation.id },
        select: { notes: true, score: true },
      }))?.notes,
    ).toBe(SECRET_SCORE);
    expect(
      (await prisma.blueprintQuestion.findFirst({
        where: { blueprintId: blueprint.id },
        select: { question: true },
      }))?.question,
    ).toBe(SECRET_QUESTION);
    expect(
      (await prisma.application.findUnique({
        where: { id: application.id },
        select: { status: true },
      }))?.status,
    ).toBe(ApplicationPipelineStatus.TECH_EVALUATION);
    void otherJob;
  });
});
