import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  InterviewerCategory,
  JobStatus,
  OrganizationMemberRole,
  PortalRole,
  RequirementLifecycle,
} from "@prisma/client";
import { confirmClientCandidateHire } from "@/app/actions/application-actions";
import { notifyCandidateOfStageChange } from "@/lib/candidates/stage-change-emails";
import { sendOutboundEmail } from "@/lib/communication/email-transport";
import { retryNotificationEmail } from "@/lib/communication/notification-service";
import { generateSecureToken } from "@/lib/auth/secure-token";
import {
  bookSlotWithToken,
  createSlotsForJobForAdmin,
} from "@/lib/interviews/scheduling-service";
import {
  getApplicationById,
  getClientApplicationsForRequirement,
} from "@/lib/repositories/application-repository";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const actor = vi.hoisted(() => ({ id: "0" }));
const transport = vi.hoisted(() => ({
  result: { sent: false as const, reason: "provider-not-configured" as const },
}));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("@/lib/communication/email-transport", () => ({
  sendOutboundEmail: vi.fn(async () => transport.result),
}));











const MARKER = `mail-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe.skipIf(integrationDatabase.mode === "skip")("email delivery status", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    const where = { companyId: { in: companyIds } };
    await prisma.billingLineItem.deleteMany({ where: { billingRecord: where } });
    await prisma.billingRecord.deleteMany({ where });
    await deleteAuditLogsForTests(where);
    await prisma.outcomeEvent.deleteMany({ where });
    await prisma.notification.deleteMany({ where });
    await prisma.interview.deleteMany({ where: { application: where } });
    await prisma.interviewBookingInvite.deleteMany({ where: { application: where } });
    await prisma.interviewSlot.deleteMany({ where: { job: where } });
    await prisma.applicationIngestionEvent.deleteMany({ where });
    await prisma.jobSpecificationVersion.deleteMany({ where: { job: where } });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.job.deleteMany({ where });
    await prisma.organizationMember.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.interviewer.deleteMany({ where: { id: { in: interviewerIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("records stage and booking delivery without exposing the recipient", async () => {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} co`,
        industry: "Test",
        employees: 2,
        publicSlug: `${MARKER}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    const other = await prisma.company.create({
      data: {
        name: `${MARKER} other`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-other`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id, other.id);
    const interviewer = await prisma.interviewer.create({
      data: { name: `${MARKER} iv`, category: InterviewerCategory.ENGINEERING },
    });
    interviewerIds.push(interviewer.id);

    async function user(label: string, role: PortalRole, companyId: number | null, interviewerId: number | null) {
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

    const owner = await user("owner", PortalRole.CLIENT, company.id, null);
    const otherOwner = await user("other", PortalRole.CLIENT, other.id, null);
    const admin = await user("admin", PortalRole.ADMIN, null, null);
    const interviewerUser = await user("iv", PortalRole.INTERVIEWER, null, interviewer.id);
    await prisma.organizationMember.createMany({
      data: [
        { userId: owner, companyId: company.id, role: OrganizationMemberRole.OWNER, status: "ACTIVE" },
        { userId: otherOwner, companyId: other.id, role: OrganizationMemberRole.OWNER, status: "ACTIVE" },
      ],
    });

    const job = await prisma.job.create({
      data: {
        title: `${MARKER} role`,
        status: JobStatus.OPEN,
        companyId: company.id,
        requirementLifecycle: RequirementLifecycle.SOURCING_SHORTLISTING,
        assignedInterviewerId: interviewer.id,
      },
    });
    const candidate = await prisma.candidate.create({
      data: {
        name: `${MARKER} candidate`,
        role: "Engineer",
        experienceYears: 3,
        status: CandidateStatus.APPLIED,
        companyId: company.id,
      },
    });
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        companyId: company.id,
        status: ApplicationPipelineStatus.SELECTED,
      },
    });

    asUser(owner);
    transport.result = { sent: false, reason: "provider-not-configured" };
    const hired = await confirmClientCandidateHire(application.id);
    expect(hired.status).toBe(ApplicationPipelineStatus.HIRED);
    await notifyCandidateOfStageChange(application.id, ApplicationPipelineStatus.HIRED);
    const missing = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
      select: { status: true, candidateStageEmailStatus: true },
    });
    expect(missing.status).toBe(ApplicationPipelineStatus.HIRED);
    expect(missing.candidateStageEmailStatus).toBe("MISSING_RECIPIENT");

    const spec = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: job.id,
        versionNumber: 1,
        status: "DRAFT",
        title: `${MARKER} role`,
      },
    });
    await prisma.applicationIngestionEvent.create({
      data: {
        companyId: company.id,
        jobId: job.id,
        applicationId: application.id,
        sourceChannel: "MANUAL",
        jobSpecificationVersionId: spec.id,
        applicantEmailNormalized: `${MARKER}-person@hireiq.test`.toLowerCase(),
        applicantName: "Pat",
      },
    });
    await notifyCandidateOfStageChange(application.id, ApplicationPipelineStatus.HIRED);
    expect(
      (await prisma.application.findUnique({ where: { id: application.id } }))?.candidateStageEmailStatus,
    ).toBe("PROVIDER_NOT_CONFIGURED");
    expect(
      (await prisma.application.findUnique({ where: { id: application.id } }))?.status,
    ).toBe(ApplicationPipelineStatus.HIRED);

    transport.result = { sent: false, reason: "provider-error", error: "down" } as never;
    await notifyCandidateOfStageChange(application.id, ApplicationPipelineStatus.REJECTED);
    expect(
      (await prisma.application.findUnique({ where: { id: application.id } }))?.candidateStageEmailStatus,
    ).toBe("PROVIDER_ERROR");

    transport.result = { sent: true, provider: "resend" } as never;
    await notifyCandidateOfStageChange(application.id, ApplicationPipelineStatus.HIRED);
    const sentRow = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
      select: { candidateStageEmailStatus: true, status: true },
    });
    expect(sentRow.candidateStageEmailStatus).toBe("SENT");
    expect(sentRow.status).toBe(ApplicationPipelineStatus.HIRED);

    asUser(admin);
    await createSlotsForJobForAdmin({
      jobId: job.id,
      interviewerId: interviewer.id,
      interviewType: "TECHNICAL",
      slots: [{ startAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 30 }],
    });
    const slot = await prisma.interviewSlot.findFirstOrThrow({ where: { jobId: job.id } });
    const { rawToken, tokenHash } = generateSecureToken();
    await prisma.interviewBookingInvite.create({
      data: {
        applicationId: application.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    transport.result = { sent: false, reason: "provider-not-configured" };
    const booked = await bookSlotWithToken({ rawToken, slotId: slot.id });
    expect(booked.ok).toBe(true);
    const interview = await prisma.interview.findFirstOrThrow({
      where: { applicationId: application.id },
      select: { bookingEmailStatus: true },
    });
    expect(interview.bookingEmailStatus).toBe("PROVIDER_NOT_CONFIGURED");
    expect((await prisma.interviewSlot.findUnique({ where: { id: slot.id } }))?.status).toBe("BOOKED");

    asUser(owner);
    const own = await getClientApplicationsForRequirement(job.id);
    expect(own.map((row) => row.candidateStageEmailStatus)).toEqual(["SENT"]);
    expect(JSON.stringify(own)).not.toContain("@");

    asUser(otherOwner);
    expect(await getClientApplicationsForRequirement(job.id)).toEqual([]);

    // Scope checks read test-owned rows by id. The list queries scan every tenant, so running them here raced other
    // suites deleting their own jobs mid-read (Prisma loads application and job in separate queries).
    const otherCandidate = await prisma.candidate.create({
      data: { name: `${MARKER} other candidate`, role: "Engineer", experienceYears: 1, status: CandidateStatus.APPLIED, companyId: other.id },
    });
    const otherJob = await prisma.job.create({ data: { title: `${MARKER} other role`, status: JobStatus.OPEN, companyId: other.id } });
    const otherApplication = await prisma.application.create({
      data: { candidateId: otherCandidate.id, jobId: otherJob.id, companyId: other.id, status: ApplicationPipelineStatus.SELECTED },
    });

    asUser(admin);
    const adminRow = await getApplicationById(application.id);
    expect(adminRow?.candidateStageEmailStatus).toBe("SENT");
    expect((await getApplicationById(otherApplication.id))?.id).toBe(otherApplication.id);

    asUser(interviewerUser);
    expect((await getApplicationById(application.id))?.id).toBe(application.id);
    expect(await getApplicationById(otherApplication.id)).toBeNull();

    const callsBefore = vi.mocked(sendOutboundEmail).mock.calls.length;
    const notice = await prisma.notification.create({
      data: {
        type: "INTERVIEWER_REQUIREMENT_READY",
        message: "ready",
        jobId: job.id,
        companyId: company.id,
        interviewerId: interviewer.id,
        emailDeliveredAt: new Date(),
      },
    });
    const retry = await retryNotificationEmail(notice.id);
    expect(retry).toMatchObject({ attempted: false, reason: "already-delivered" });
    expect(vi.mocked(sendOutboundEmail).mock.calls.length).toBe(callsBefore);

    await notifyCandidateOfStageChange(application.id, ApplicationPipelineStatus.EXPERT_REVIEW);
    expect(
      (await prisma.application.findUnique({ where: { id: application.id } }))?.candidateStageEmailStatus,
    ).toBe("SENT");
  });
});
