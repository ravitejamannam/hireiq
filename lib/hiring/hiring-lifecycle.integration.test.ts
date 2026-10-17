import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  InterviewerCategory,
  JobSpecificationVersionStatus,
  JobStatus,
  OrganizationMemberRole,
  PortalRole,
  RequirementSupportState,
  SourcingDatabaseSource,
} from "@prisma/client";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

import {
  confirmClientCandidateHire,
  createApplication,
  selectClientCandidate,
  transitionApplicationStatus,
  transitionInterviewerApplicationStatus,
} from "@/app/actions/application-actions";
import {
  saveInterviewerEvaluation,
  submitInterviewerHiringRecommendation,
} from "@/app/actions/evaluation-actions";
import {
  assignInterviewerToJob,
  createClientRequirement,
  markJobSourcingAccessReceived,
  notifyAssignedInterviewer,
  updateJob,
} from "@/app/actions/job-actions";
import { AuthorizationError } from "@/lib/auth/authorization";
import { executeAttachRecruiterTextualEvidence } from "@/lib/candidates/evidence-capture/evidence-capture-service";
import { executeRunMatcherV2 } from "@/lib/candidates/matching/matching-v2-service";
import { prisma } from "@/lib/prisma";

const MARKER = `life-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe("hiring lifecycle", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];
  const questionIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    const where = { companyId: { in: companyIds } };
    await prisma.billingLineItem.deleteMany({
      where: { billingRecord: where },
    });
    await prisma.billingRecord.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.outcomeEvent.deleteMany({ where });
    await prisma.notification.deleteMany({ where });
    await prisma.requirementAssessment.deleteMany({ where });
    await prisma.requirementAssessmentRun.deleteMany({ where });
    await prisma.candidateClaim.deleteMany({ where });
    await prisma.candidateIntelligenceRun.deleteMany({ where });
    await prisma.candidateEvidence.deleteMany({ where });
    await prisma.jobRequirement.deleteMany({ where });
    await prisma.jobIntelligenceRun.deleteMany({ where });
    await prisma.evaluation.deleteMany({
      where: { application: where },
    });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.job.updateMany({
      where,
      data: { currentPublishedSpecificationVersionId: null },
    });
    await prisma.jobSpecificationVersion.deleteMany({
      where: { job: where },
    });
    await prisma.job.deleteMany({ where });
    await prisma.organizationMember.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.interviewer.deleteMany({ where: { id: { in: interviewerIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    if (questionIds.length > 0) {
      await prisma.assessmentBankQuestion.deleteMany({ where: { id: { in: questionIds } } });
    }
  });

  it("hires one application without rewriting earlier specification or assessment history", async () => {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} co`,
        industry: "Test",
        employees: 2,
        publicSlug: `${MARKER}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    const otherCompany = await prisma.company.create({
      data: {
        name: `${MARKER} other`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-other`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id, otherCompany.id);

    const interviewer = await prisma.interviewer.create({
      data: { name: `${MARKER} iv`, category: InterviewerCategory.ENGINEERING },
    });
    const outsider = await prisma.interviewer.create({
      data: { name: `${MARKER} out`, category: InterviewerCategory.ENGINEERING },
    });
    interviewerIds.push(interviewer.id, outsider.id);

    async function user(
      label: string,
      role: PortalRole,
      companyId: number | null,
      interviewerId: number | null,
    ) {
      const created = await prisma.user.create({
        data: {
          email: `${MARKER}-${label}@hireiq.test`.toLowerCase(),
          name: label,
          role,
          passwordHash: "not-a-login",
          emailVerifiedAt: new Date(),
          companyId,
          interviewerId,
        },
      });
      userIds.push(created.id);
      return created.id;
    }

    const ownerId = await user("owner", PortalRole.CLIENT, company.id, null);
    const memberId = await user("member", PortalRole.CLIENT, company.id, null);
    const otherOwnerId = await user("other", PortalRole.CLIENT, otherCompany.id, null);
    const adminId = await user("admin", PortalRole.ADMIN, null, null);

    await prisma.organizationMember.createMany({
      data: [
        {
          userId: ownerId,
          companyId: company.id,
          role: OrganizationMemberRole.OWNER,
          status: "ACTIVE",
        },
        {
          userId: memberId,
          companyId: company.id,
          role: OrganizationMemberRole.MEMBER,
          status: "ACTIVE",
        },
        {
          userId: otherOwnerId,
          companyId: otherCompany.id,
          role: OrganizationMemberRole.OWNER,
          status: "ACTIVE",
        },
      ],
    });

    asUser(ownerId);
    const bank = await prisma.assessmentBankQuestion.create({
      data: {
        roleCategory: "ENGINEERING",
        sortOrder: 800_000 + (process.pid % 1000),
        prompt: `${MARKER} typescript question`,
        choices: ["Yes", "No"],
        correctIndex: 0,
        difficulty: "MEDIUM",
      },
    });
    questionIds.push(bank.id);
    const posted = await createClientRequirement(`${MARKER} role`, {
      roleCategory: "ENGINEERING",
      experienceRange: "3-5",
      location: "Remote",
      compensationRange: "100-120",
      targetHireDate: new Date("2026-12-01T00:00:00.000Z"),
      numberOfPositions: 1,
      mustHaveRequirements: "TypeScript",
      niceToHaveRequirements: "GraphQL",
      jobDescription: "Build hiring software.",
      evaluationCriteria: "System design",
      primarySkills: "TypeScript",
    }, crypto.randomUUID());
    if ("error" in posted) {
      throw new Error(posted.error);
    }

    const published = await prisma.jobSpecificationVersion.findUniqueOrThrow({
      where: { id: posted.currentPublishedSpecificationVersionId ?? 0 },
    });
    expect(published.status).toBe(JobSpecificationVersionStatus.PUBLISHED);
    expect(published.jobId).toBe(posted.id);
    expect(published.mustHaveRequirements).toBe("TypeScript");
    expect(published.jobDescription).toBe("Build hiring software.");

    asUser(adminId);
    await updateJob(posted.id, posted.title, JobStatus.OPEN, company.id, {
      sourcingDatabaseSource: SourcingDatabaseSource.LINKEDIN,
    });
    await assignInterviewerToJob(posted.id, interviewer.id);
    await notifyAssignedInterviewer(posted.id);
    await markJobSourcingAccessReceived(posted.id);

    const interviewerUserId = await user("iv", PortalRole.INTERVIEWER, null, interviewer.id);
    const outsiderUserId = await user("out", PortalRole.INTERVIEWER, null, outsider.id);

    const candidate = await prisma.candidate.create({
      data: {
        name: `${MARKER} candidate`,
        role: "Engineer",
        experienceYears: 4,
        status: CandidateStatus.APPLIED,
        companyId: company.id,
      },
    });
    const application = await createApplication(candidate.id, posted.id);
    expect(application.companyId).toBe(company.id);
    expect(application.status).toBe(ApplicationPipelineStatus.CV_POOL);

    const evidence = await executeAttachRecruiterTextualEvidence({
      jobId: posted.id,
      applicationId: application.id,
      inlineText: "Shipped production TypeScript services.",
      actorUserId: adminId,
    });
    expect(evidence.companyId).toBe(company.id);
    expect(evidence.applicationId).toBe(application.id);

    const assessment = await executeRunMatcherV2({
      applicationId: application.id,
      jobSpecificationVersionId: published.id,
    });
    expect(assessment.companyId).toBe(company.id);
    expect(assessment.jobSpecificationVersionId).toBe(published.id);
    const supported = assessment.assessments.filter(
      (row) => row.supportState === RequirementSupportState.SUPPORTED,
    );
    expect(supported.length).toBeGreaterThan(0);
    expect(supported.every((row) => row.evidenceId === evidence.evidenceId)).toBe(true);

    asUser(otherOwnerId);
    await expect(selectClientCandidate(application.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(
      (await prisma.application.findUnique({ where: { id: application.id } }))?.status,
    ).toBe(ApplicationPipelineStatus.CV_POOL);

    asUser(adminId);
    await transitionApplicationStatus(
      application.id,
      ApplicationPipelineStatus.EXPERT_REVIEW,
    );
    await transitionApplicationStatus(
      application.id,
      ApplicationPipelineStatus.TECH_EVALUATION,
    );

    asUser(outsiderUserId);
    await expect(
      submitInterviewerHiringRecommendation(application.id, "HIRE", "Not assigned."),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(await prisma.evaluation.count({ where: { applicationId: application.id } })).toBe(0);
    expect(
      (await prisma.application.findUnique({ where: { id: application.id } }))?.status,
    ).toBe(ApplicationPipelineStatus.TECH_EVALUATION);

    asUser(interviewerUserId);
    const evaluation = await saveInterviewerEvaluation(application.id, {
      overallScore: 4,
      notes: "Clear TypeScript depth.",
    });
    expect(evaluation.applicationId).toBe(application.id);
    const recommendation = await submitInterviewerHiringRecommendation(
      application.id,
      "HIRE",
      "Recommend hire for the TypeScript requirement.",
    );
    expect(recommendation.recommendation).toBe("HIRE");
    expect(
      (await prisma.application.findUnique({ where: { id: application.id } }))?.status,
    ).toBe(ApplicationPipelineStatus.TECH_EVALUATION);
    expect(
      await prisma.outcomeEvent.count({ where: { applicationId: application.id, eventType: "HIRED" } }),
    ).toBe(0);

    await transitionInterviewerApplicationStatus(
      application.id,
      ApplicationPipelineStatus.SHORTLISTED,
    );
    asUser(ownerId);
    await selectClientCandidate(application.id);

    asUser(memberId);
    await expect(confirmClientCandidateHire(application.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    asUser(otherOwnerId);
    await expect(confirmClientCandidateHire(application.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(
      (await prisma.application.findUnique({ where: { id: application.id } }))?.status,
    ).toBe(ApplicationPipelineStatus.SELECTED);
    expect(
      await prisma.outcomeEvent.count({ where: { applicationId: application.id, eventType: "HIRED" } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { companyId: company.id, action: "HIRE_CONFIRMED" } }),
    ).toBe(0);

    asUser(ownerId);
    const hired = await confirmClientCandidateHire(application.id);
    expect(hired.status).toBe(ApplicationPipelineStatus.HIRED);

    const hiredEvents = await prisma.outcomeEvent.findMany({
      where: { applicationId: application.id, eventType: "HIRED" },
    });
    expect(hiredEvents).toHaveLength(1);
    expect(hiredEvents[0]?.companyId).toBe(company.id);

    const audits = await prisma.auditLog.findMany({
      where: { companyId: company.id, action: "HIRE_CONFIRMED", targetId: application.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorUserId).toBe(ownerId);

    const publishedAfter = await prisma.jobSpecificationVersion.findUniqueOrThrow({
      where: { id: published.id },
    });
    expect(publishedAfter.jobDescription).toBe("Build hiring software.");
    expect(publishedAfter.mustHaveRequirements).toBe("TypeScript");
    expect(publishedAfter.status).toBe(JobSpecificationVersionStatus.PUBLISHED);

    const storedAssessment = await prisma.requirementAssessmentRun.findFirstOrThrow({
      where: { applicationId: application.id, companyId: company.id },
    });
    expect(storedAssessment.jobSpecificationVersionId).toBe(published.id);
    expect(supported[0]?.companyId).toBe(company.id);
  });
});
