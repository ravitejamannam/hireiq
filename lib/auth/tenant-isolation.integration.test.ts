import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  BillingStatus,
  CandidateStatus,
  InterviewerCategory,
  JobStatus,
  OrganizationMemberRole,
  PortalRole,
  RequirementLifecycle,
} from "@prisma/client";
import { selectClientCandidate, transitionInterviewerApplicationStatus } from "@/app/actions/application-actions";
import { inviteOrganizationMember } from "@/app/actions/organization-actions";
import { getClientBillingRecordById, getBillingRecordById } from "@/lib/repositories/billing-repository";
import { getCandidateById } from "@/lib/repositories/candidate-repository";
import { getClientApplicationForRequirement, getApplicationById } from "@/lib/repositories/application-repository";
import { updateBillingRecordStatus } from "@/app/actions/billing-actions";
import { getEvaluationById } from "@/lib/repositories/evaluation-repository";
import { getJobById } from "@/lib/repositories/job-repository";
import { AuthorizationError } from "@/lib/auth/authorization";
import { ApplicationValidationError } from "@/lib/validation/application-validation";
import { OrganizationMembershipError } from "@/lib/validation/organization-membership-validation";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
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















const MARKER = `iso-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe.skipIf(integrationDatabase.mode === "skip")("tenant isolation boundaries", () => {
  const ids: {
    companies: number[];
    users: number[];
    interviewers: number[];
  } = { companies: [], users: [], interviewers: [] };

  let ownerA = 0;
  let memberA = 0;
  let ownerB = 0;
  let admin = 0;
  let interviewerA = 0;
  let interviewerB = 0;
  let jobA = 0;
  let jobB = 0;
  let appA = 0;
  let appB = 0;
  let billingA = 0;
  let billingB = 0;
  let evaluationB = 0;

  afterAll(async () => {
    const companyIds = ids.companies;
    if (companyIds.length === 0) return;
    await prisma.outcomeEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await deleteAuditLogsForTests({ companyId: { in: companyIds } });
    await prisma.evaluation.deleteMany({
      where: { application: { companyId: { in: companyIds } } },
    });
    await prisma.billingRecord.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.interviewer.deleteMany({ where: { id: { in: ids.interviewers } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("keeps client, interviewer, and admin access on the owning company", async () => {
    const companyA = await prisma.company.create({
      data: {
        name: `${MARKER} A`,
        industry: "Test",
        employees: 2,
        publicSlug: `${MARKER}-a`.toLowerCase(),
      },
    });
    const companyB = await prisma.company.create({
      data: {
        name: `${MARKER} B`,
        industry: "Test",
        employees: 2,
        publicSlug: `${MARKER}-b`.toLowerCase(),
      },
    });
    ids.companies.push(companyA.id, companyB.id);

    const interviewerRowA = await prisma.interviewer.create({
      data: { name: `${MARKER} iv A`, category: InterviewerCategory.ENGINEERING },
    });
    const interviewerRowB = await prisma.interviewer.create({
      data: { name: `${MARKER} iv B`, category: InterviewerCategory.ENGINEERING },
    });
    ids.interviewers.push(interviewerRowA.id, interviewerRowB.id);

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
      ids.users.push(created.id);
      return created.id;
    }

    ownerA = await user("owner-a", PortalRole.CLIENT, companyA.id, null);
    memberA = await user("member-a", PortalRole.CLIENT, companyA.id, null);
    ownerB = await user("owner-b", PortalRole.CLIENT, companyB.id, null);
    admin = await user("admin", PortalRole.ADMIN, null, null);
    interviewerA = await user("iv-a", PortalRole.INTERVIEWER, null, interviewerRowA.id);
    interviewerB = await user("iv-b", PortalRole.INTERVIEWER, null, interviewerRowB.id);

    for (const [userId, companyId, role] of [
      [ownerA, companyA.id, OrganizationMemberRole.OWNER],
      [memberA, companyA.id, OrganizationMemberRole.MEMBER],
      [ownerB, companyB.id, OrganizationMemberRole.OWNER],
    ] as const) {
      await prisma.organizationMember.create({
        data: { userId, companyId, role, status: "ACTIVE" },
      });
    }

    const jobRowA = await prisma.job.create({
      data: {
        title: `${MARKER} role A`,
        status: JobStatus.OPEN,
        companyId: companyA.id,
        requirementLifecycle: RequirementLifecycle.SOURCING_SHORTLISTING,
        assignedInterviewerId: interviewerRowA.id,
      },
    });
    const jobRowB = await prisma.job.create({
      data: {
        title: `${MARKER} role B`,
        status: JobStatus.OPEN,
        companyId: companyB.id,
        requirementLifecycle: RequirementLifecycle.SOURCING_SHORTLISTING,
        assignedInterviewerId: interviewerRowB.id,
      },
    });
    jobA = jobRowA.id;
    jobB = jobRowB.id;

    const candidateA = await prisma.candidate.create({
      data: {
        name: `${MARKER} candidate A`,
        role: "Engineer",
        experienceYears: 3,
        status: CandidateStatus.APPLIED,
        companyId: companyA.id,
      },
    });
    const candidateB = await prisma.candidate.create({
      data: {
        name: `${MARKER} candidate B`,
        role: "Engineer",
        experienceYears: 4,
        status: CandidateStatus.APPLIED,
        companyId: companyB.id,
      },
    });

    const applicationA = await prisma.application.create({
      data: {
        candidateId: candidateA.id,
        jobId: jobA,
        companyId: companyA.id,
        status: ApplicationPipelineStatus.TECH_EVALUATION,
      },
    });
    const applicationB = await prisma.application.create({
      data: {
        candidateId: candidateB.id,
        jobId: jobB,
        companyId: companyB.id,
        status: ApplicationPipelineStatus.SHORTLISTED,
      },
    });
    appA = applicationA.id;
    appB = applicationB.id;

    const billA = await prisma.billingRecord.create({
      data: { companyId: companyA.id, jobId: jobA, status: BillingStatus.PENDING },
    });
    const billB = await prisma.billingRecord.create({
      data: { companyId: companyB.id, jobId: jobB, status: BillingStatus.READY },
    });
    billingA = billA.id;
    billingB = billB.id;

    const evaluation = await prisma.evaluation.create({
      data: {
        applicationId: appB,
        interviewerId: interviewerRowB.id,
        notes: `${MARKER} private notes`,
        scorecard: { marker: MARKER },
      },
    });
    evaluationB = evaluation.id;
    const evaluationA = await prisma.evaluation.create({
      data: {
        applicationId: appA,
        interviewerId: interviewerRowA.id,
        notes: `${MARKER} assigned notes`,
        scorecard: { marker: `${MARKER}-a` },
      },
    });

    asUser(ownerA);
    const ownJob = await getJobById(jobA);
    expect(ownJob?.id).toBe(jobA);
    expect(await getJobById(jobB)).toBeNull();
    expect(await getCandidateById(candidateB.id)).toBeNull();
    expect(
      (await prisma.candidate.findUnique({
        where: { id: candidateB.id },
        select: { name: true, companyId: true },
      })),
    ).toEqual({ name: `${MARKER} candidate B`, companyId: companyB.id });

    const ownApplication = await getClientApplicationForRequirement(jobA, appA);
    expect(ownApplication?.candidate.name).toBe(`${MARKER} candidate A`);
    expect(await getClientApplicationForRequirement(jobB, appB)).toBeNull();
    expect(await getApplicationById(appB)).toBeNull();

    expect((await getClientBillingRecordById(billingA))?.status).toBe(BillingStatus.PENDING);
    expect(await getClientBillingRecordById(billingB)).toBeNull();

    await expect(selectClientCandidate(appB)).rejects.toBeInstanceOf(AuthorizationError);
    expect(
      (await prisma.application.findUnique({ where: { id: appB }, select: { status: true } }))
        ?.status,
    ).toBe(ApplicationPipelineStatus.SHORTLISTED);
    expect(
      (await prisma.evaluation.findUnique({ where: { id: evaluationB }, select: { notes: true } }))
        ?.notes,
    ).toBe(`${MARKER} private notes`);

    asUser(memberA);
    expect(await getJobById(jobB)).toBeNull();
    await expect(inviteOrganizationMember("stranger@hireiq.test")).rejects.toBeInstanceOf(
      OrganizationMembershipError,
    );
    const memberCandidate = await prisma.candidate.create({
      data: {
        name: `${MARKER} member candidate`,
        role: "Engineer",
        experienceYears: 2,
        status: CandidateStatus.APPLIED,
        companyId: companyA.id,
      },
    });
    const memberApplication = await prisma.application.create({
      data: {
        candidateId: memberCandidate.id,
        jobId: jobA,
        companyId: companyA.id,
        status: ApplicationPipelineStatus.SHORTLISTED,
      },
    });
    const selected = await selectClientCandidate(memberApplication.id);
    expect(selected.status).toBe(ApplicationPipelineStatus.SELECTED);
    await selectClientCandidate(appB).catch(() => undefined);
    expect(
      (await prisma.application.findUnique({ where: { id: appB }, select: { status: true } }))
        ?.status,
    ).toBe(ApplicationPipelineStatus.SHORTLISTED);

    asUser(interviewerA);
    const moved = await transitionInterviewerApplicationStatus(
      appA,
      ApplicationPipelineStatus.SHORTLISTED,
    );
    expect(moved.status).toBe(ApplicationPipelineStatus.SHORTLISTED);
    expect((await getEvaluationById(evaluationA.id))?.notes).toBe(
      `${MARKER} assigned notes`,
    );
    expect(await getEvaluationById(evaluationB)).toBeNull();
    await expect(
      transitionInterviewerApplicationStatus(appA, ApplicationPipelineStatus.HIRED),
    ).rejects.toBeInstanceOf(ApplicationValidationError);
    await expect(
      transitionInterviewerApplicationStatus(appB, ApplicationPipelineStatus.REJECTED),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(
      (await prisma.application.findUnique({ where: { id: appB }, select: { status: true } }))
        ?.status,
    ).toBe(ApplicationPipelineStatus.SHORTLISTED);

    asUser(interviewerB);
    await expect(
      transitionInterviewerApplicationStatus(appA, ApplicationPipelineStatus.REJECTED),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(
      (await prisma.application.findUnique({ where: { id: appA }, select: { status: true } }))
        ?.status,
    ).toBe(ApplicationPipelineStatus.SHORTLISTED);
    expect(await getEvaluationById(evaluationA.id)).toBeNull();

    asUser(ownerA);
    expect(await getEvaluationById(evaluationB)).toBeNull();

    asUser(admin);
    expect((await getJobById(jobA))?.companyId).toBe(companyA.id);
    expect((await getJobById(jobB))?.companyId).toBe(companyB.id);
    expect((await getApplicationById(appA))?.id).toBe(appA);
    expect((await getApplicationById(appB))?.id).toBe(appB);
    expect((await getEvaluationById(evaluationB))?.notes).toBe(`${MARKER} private notes`);
    const billed = await updateBillingRecordStatus(billingA, BillingStatus.READY);
    expect(billed.status).toBe(BillingStatus.READY);
    asUser(ownerB);
    await expect(
      updateBillingRecordStatus(billingA, BillingStatus.CANCELLED),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(
      (await prisma.billingRecord.findUnique({ where: { id: billingA }, select: { status: true } }))
        ?.status,
    ).toBe(BillingStatus.READY);
    expect(
      (await prisma.billingRecord.findUnique({ where: { id: billingB }, select: { status: true } }))
        ?.status,
    ).toBe(BillingStatus.READY);
    expect(
      (await prisma.billingRecord.findUnique({ where: { id: billingB }, select: { status: true } }))
        ?.status,
    ).toBe(BillingStatus.READY);

    asUser(interviewerA);
    await expect(getBillingRecordById(billingB)).rejects.toBeInstanceOf(AuthorizationError);
    expect(
      (await prisma.billingRecord.findUnique({
        where: { id: billingB },
        select: { status: true, companyId: true },
      })),
    ).toEqual({ status: BillingStatus.READY, companyId: companyB.id });
  });
});
