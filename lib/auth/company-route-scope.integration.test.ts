import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CandidateStatus, JobStatus, OrganizationMemberRole, OrganizationMemberStatus, PortalRole, RequirementLifecycle } from "@prisma/client";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

import { bulkReviewApplications, decideReviewApplication } from "@/app/actions/review-queue-actions";
import { GET as resumeDownload } from "@/app/api/resumes/[documentId]/route";
import { POST as schedulingSlots } from "@/app/api/scheduling/slots/route";
import { POST as fairnessAct } from "@/app/dashboard/fairness/act/route";
import { POST as deletionAct } from "@/app/dashboard/deletions/act/route";
import { POST as rediscoveryAct } from "@/app/dashboard/jobs/[id]/rediscovery/route";
import JobAssessmentPage from "@/app/dashboard/jobs/[id]/assessment/page";
import JobInterviewsPage from "@/app/dashboard/jobs/[id]/interviews/page";
import JobReviewPage from "@/app/dashboard/jobs/[id]/review/page";
import { deniesCrossCompany, requireUser } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

const MARKER = `scope-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe("company scope on dashboard routes", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  let companyAId = 0;
  let companyBId = 0;
  let adminAId = 0;
  let strippedId = 0;
  let jobBId = 0;
  let applicationBId = 0;
  let resumeBId = 0;
  let deletionBId = 0;

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.candidateDeletionRequest.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidateResumeDocument.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  beforeAll(async () => {
    const companyA = await prisma.company.create({
      data: { name: `${MARKER} A`, industry: "Test", employees: 2, publicSlug: `${MARKER}-a` },
    });
    const companyB = await prisma.company.create({
      data: { name: `${MARKER} B`, industry: "Test", employees: 2, publicSlug: `${MARKER}-b` },
    });
    companyIds.push(companyA.id, companyB.id);

    const adminA = await prisma.user.create({
      data: {
        email: `${MARKER}-a@hireiq.test`,
        name: "Company admin",
        role: PortalRole.ADMIN,
        passwordHash: "x",
        emailVerifiedAt: new Date(),
        companyId: null,
      },
    });
    const stripped = await prisma.user.create({
      data: {
        email: `${MARKER}-stripped@hireiq.test`,
        name: "Former admin",
        role: PortalRole.ADMIN,
        passwordHash: "x",
        emailVerifiedAt: new Date(),
        companyId: null,
      },
    });
    userIds.push(adminA.id, stripped.id);
    await prisma.organizationMember.create({
      data: { userId: adminA.id, companyId: companyA.id, role: OrganizationMemberRole.OWNER, status: OrganizationMemberStatus.ACTIVE },
    });
    await prisma.organizationMember.create({
      data: { userId: stripped.id, companyId: companyA.id, role: OrganizationMemberRole.OWNER, status: OrganizationMemberStatus.REMOVED },
    });

    const jobB = await prisma.job.create({
      data: {
        title: `${MARKER} B`,
        status: JobStatus.OPEN,
        companyId: companyB.id,
        requirementLifecycle: RequirementLifecycle.SOURCING_SHORTLISTING,
      },
    });
    const candidateB = await prisma.candidate.create({
      data: { name: `${MARKER} B`, role: "Engineer", experienceYears: 1, status: CandidateStatus.APPLIED, companyId: companyB.id },
    });
    const applicationB = await prisma.application.create({
      data: { candidateId: candidateB.id, jobId: jobB.id, companyId: companyB.id },
    });
    const resumeB = await prisma.candidateResumeDocument.create({
      data: {
        companyId: companyB.id,
        candidateId: candidateB.id,
        applicationId: applicationB.id,
        fileName: "b.pdf",
        contentType: "application/pdf",
        storageKey: `${MARKER}/missing.pdf`,
        sizeBytes: 1,
        contentSha256: "abc",
      },
    });
    const deletionB = await prisma.candidateDeletionRequest.create({
      data: { companyId: companyB.id, candidateId: candidateB.id, applicationId: applicationB.id, emailNormalized: `${MARKER}@hireiq.test` },
    });
    deletionBId = deletionB.id;
    companyAId = companyA.id;
    companyBId = companyB.id;
    adminAId = adminA.id;
    strippedId = stripped.id;
    jobBId = jobB.id;
    applicationBId = applicationB.id;
    resumeBId = resumeB.id;
  });

  it("restores a company admin who lost companyId, and does not make a former member a platform operator", async () => {
    asUser(adminAId);
    const hydrated = await requireUser();
    expect(hydrated.companyId).toBe(companyAId);
    expect(hydrated.platformOperator).toBe(false);
    expect(deniesCrossCompany(hydrated, companyBId)).toBe(true);

    asUser(strippedId);
    const former = await requireUser();
    expect(former.platformOperator).toBe(false);
    expect(deniesCrossCompany(former, companyBId)).toBe(true);
  });

  it("hides another company's review page", async () => {
    asUser(adminAId);
    await expect(JobReviewPage({ params: Promise.resolve({ id: String(jobBId) }), searchParams: Promise.resolve({}) })).rejects.toThrow();
  });

  it("hides another company's interviews page", async () => {
    asUser(adminAId);
    await expect(JobInterviewsPage({ params: Promise.resolve({ id: String(jobBId) }) })).rejects.toThrow();
  });

  it("hides another company's assessment page", async () => {
    asUser(adminAId);
    await expect(JobAssessmentPage({ params: Promise.resolve({ id: String(jobBId) }) })).rejects.toThrow();
  });

  it("hides another company's resume download", async () => {
    asUser(adminAId);
    const resume = await resumeDownload(new Request("http://localhost/resume"), { params: Promise.resolve({ documentId: String(resumeBId) }) });
    expect(resume.status).toBe(404);
  });

  it("refuses scheduling slots for another company's job", async () => {
    asUser(adminAId);
    const slots = await schedulingSlots(new Request("http://localhost/slots", {
      method: "POST",
      body: JSON.stringify({ jobId: jobBId, interviewerId: 1, interviewType: "TECHNICAL", slots: [{ startAt: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 45 }] }),
    }));
    expect(slots.status).toBeGreaterThanOrEqual(400);
    expect(await slots.json()).toMatchObject({ ok: false });
  });

  it("refuses rediscovery for another company's job", async () => {
    asUser(adminAId);
    const rediscovery = await rediscoveryAct(new Request("http://localhost/rediscovery", { method: "POST", body: new FormData() }), {
      params: Promise.resolve({ id: String(jobBId) }),
    });
    expect(rediscovery.status).toBe(404);
  });

  it("refuses a fairness action for another company", async () => {
    asUser(adminAId);
    const fairnessBody = new FormData();
    fairnessBody.set("companyId", String(companyBId));
    fairnessBody.set("jobId", String(jobBId));
    fairnessBody.set("requirementKey", "skills");
    fairnessBody.set("reason", "checked");
    const fairness = await fairnessAct(new Request("http://localhost/fairness", { method: "POST", body: fairnessBody }));
    expect(fairness.status).toBe(404);
  });

  it("refuses a deletion action for another company", async () => {
    asUser(adminAId);
    const deletionBody = new FormData();
    deletionBody.set("requestId", String(deletionBId));
    deletionBody.set("intent", "retain");
    deletionBody.set("reason", "law");
    const deletion = await deletionAct(new Request("http://localhost/deletions", { method: "POST", body: deletionBody }));
    expect(deletion.status).toBe(404);
  });

  it("refuses review shortlist and bulk actions for another company's application", async () => {
    asUser(adminAId);
    await expect(decideReviewApplication({
      jobId: jobBId,
      applicationId: applicationBId,
      action: "shortlist",
    })).rejects.toThrow(/not found/i);
    await expect(bulkReviewApplications({
      jobId: jobBId,
      applicationIds: [applicationBId],
      rows: [],
      action: "shortlist",
    })).rejects.toThrow(/not found/i);
  });
});
