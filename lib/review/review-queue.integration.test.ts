import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it } from "vitest";
import { CandidateStatus, JobStatus, PortalRole } from "@prisma/client";

import { applyReviewDecision } from "@/lib/review/review-queue-service";
import { prisma } from "@/lib/prisma";

const MARKER = `review-${process.pid}-${Date.now()}`;

describe("review queue audit", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.outcomeEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
  });

  it("writes an audit entry with the reason and the score for a rejection", async () => {
    const company = await prisma.company.create({
      data: {
        name: `${MARKER} co`,
        industry: "Test",
        employees: 1,
        publicSlug: MARKER.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(company.id);
    const admin = await prisma.user.create({
      data: {
        email: `${MARKER}@hireiq.test`,
        name: "Reviewer",
        role: PortalRole.ADMIN,
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(admin.id);
    const job = await prisma.job.create({
      data: { title: `${MARKER} role`, status: JobStatus.OPEN, companyId: company.id },
    });
    const candidate = await prisma.candidate.create({
      data: { name: "Asha", role: "Engineer", experienceYears: 3, status: CandidateStatus.APPLIED, companyId: company.id },
    });
    const application = await prisma.application.create({
      data: { candidateId: candidate.id, jobId: job.id, companyId: company.id },
    });

    await applyReviewDecision({
      applicationId: application.id,
      actorUserId: admin.id,
      action: "reject",
      reason: "Missing required skill",
    });

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: application.id, action: "APPLICATION_REJECTED" },
    });
    expect(audit?.actorUserId).toBe(admin.id);
    expect(audit?.reason).toContain("Missing required skill");
    expect(audit?.reason).toContain("aiScore=manual");
    expect((await prisma.application.findUnique({ where: { id: application.id } }))?.status).toBe("REJECTED");
  });
});
