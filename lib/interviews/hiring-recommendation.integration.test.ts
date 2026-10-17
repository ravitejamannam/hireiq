import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  InterviewerCategory,
  JobStatus,
  PortalRole,
} from "@prisma/client";

const actor = vi.hoisted(() => ({ id: "0" }));

vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: actor.id } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

import { transitionInterviewerApplicationStatus } from "@/app/actions/application-actions";
import { confirmClientCandidateHire } from "@/app/actions/application-actions";
import { submitInterviewerHiringRecommendation } from "@/app/actions/evaluation-actions";
import { AuthorizationError } from "@/lib/auth/authorization";
import { ApplicationValidationError } from "@/lib/validation/application-validation";
import { EvaluationValidationError } from "@/lib/validation/evaluation-validation";
import { prisma } from "@/lib/prisma";

const MARKER = `rec-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe("interviewer hiring recommendations", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.outcomeEvent.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.evaluation.deleteMany({
      where: { application: { companyId: { in: companyIds } } },
    });
    await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.organizationMember.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.interviewer.deleteMany({ where: { id: { in: interviewerIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  it("stores a recommendation without changing the hiring outcome", async () => {
    const companyA = await prisma.company.create({
      data: {
        name: `${MARKER} a`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-a`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    const companyB = await prisma.company.create({
      data: {
        name: `${MARKER} b`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-b`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(companyA.id, companyB.id);

    const profileA = await prisma.interviewer.create({
      data: { name: `${MARKER} a`, category: InterviewerCategory.ENGINEERING },
    });
    const profileB = await prisma.interviewer.create({
      data: { name: `${MARKER} b`, category: InterviewerCategory.ENGINEERING },
    });
    interviewerIds.push(profileA.id, profileB.id);

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

    const userA = await user("iv-a", PortalRole.INTERVIEWER, null, profileA.id);
    const userB = await user("iv-b", PortalRole.INTERVIEWER, null, profileB.id);
    const memberA = await user("member", PortalRole.CLIENT, companyA.id, null);
    await prisma.organizationMember.create({
      data: {
        userId: memberA,
        companyId: companyA.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    async function application(companyId: number, interviewerId: number) {
      const job = await prisma.job.create({
        data: {
          title: `${MARKER} ${companyId}`,
          status: JobStatus.OPEN,
          companyId,
          assignedInterviewerId: interviewerId,
        },
      });
      const candidate = await prisma.candidate.create({
        data: {
          name: `${MARKER} ${companyId}`,
          role: "Engineer",
          experienceYears: 2,
          status: CandidateStatus.APPLIED,
          companyId,
        },
      });
      return prisma.application.create({
        data: {
          candidateId: candidate.id,
          jobId: job.id,
          companyId,
          status: ApplicationPipelineStatus.TECH_EVALUATION,
        },
      });
    }

    const applicationA = await application(companyA.id, profileA.id);
    const applicationB = await application(companyB.id, profileB.id);

    asUser(userA);
    const hire = await submitInterviewerHiringRecommendation(
      applicationA.id,
      "HIRE",
      "Strong system design.",
    );
    expect(hire.recommendation).toBe("HIRE");
    expect(hire.notes).toBe("Strong system design.");
    const noHire = await submitInterviewerHiringRecommendation(
      applicationA.id,
      "NO_HIRE",
      "Missing production experience.",
    );
    expect(noHire.recommendation).toBe("NO_HIRE");
    expect(
      (await prisma.application.findUnique({
        where: { id: applicationA.id },
        select: { status: true },
      }))?.status,
    ).toBe(ApplicationPipelineStatus.TECH_EVALUATION);
    expect(
      await prisma.outcomeEvent.count({ where: { applicationId: applicationA.id } }),
    ).toBe(0);

    await expect(
      submitInterviewerHiringRecommendation(applicationA.id, "HIRE", "   "),
    ).rejects.toBeInstanceOf(EvaluationValidationError);
    expect(
      (await prisma.evaluation.findUnique({
        where: {
          applicationId_interviewerId: {
            applicationId: applicationA.id,
            interviewerId: profileA.id,
          },
        },
        select: { notes: true, recommendation: true },
      })),
    ).toEqual({
      notes: "Missing production experience.",
      recommendation: "NO_HIRE",
    });

    await expect(
      transitionInterviewerApplicationStatus(
        applicationA.id,
        ApplicationPipelineStatus.REJECTED,
      ),
    ).rejects.toBeInstanceOf(ApplicationValidationError);
    await expect(
      transitionInterviewerApplicationStatus(
        applicationA.id,
        ApplicationPipelineStatus.HIRED,
      ),
    ).rejects.toBeInstanceOf(ApplicationValidationError);
    expect(
      (await prisma.application.findUnique({
        where: { id: applicationA.id },
        select: { status: true },
      }))?.status,
    ).toBe(ApplicationPipelineStatus.TECH_EVALUATION);
    expect(
      await prisma.outcomeEvent.count({ where: { applicationId: applicationA.id } }),
    ).toBe(0);

    await expect(
      submitInterviewerHiringRecommendation(applicationB.id, "HIRE", "Should not save."),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(
      await prisma.evaluation.count({ where: { applicationId: applicationB.id } }),
    ).toBe(0);
    expect(
      (await prisma.application.findUnique({
        where: { id: applicationB.id },
        select: { status: true },
      }))?.status,
    ).toBe(ApplicationPipelineStatus.TECH_EVALUATION);

    asUser(userB);
    await expect(
      submitInterviewerHiringRecommendation(applicationA.id, "HIRE", "Other interviewer."),
    ).rejects.toBeInstanceOf(AuthorizationError);

    asUser(memberA);
    await expect(confirmClientCandidateHire(applicationA.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(
      (await prisma.application.findUnique({
        where: { id: applicationA.id },
        select: { status: true },
      }))?.status,
    ).toBe(ApplicationPipelineStatus.TECH_EVALUATION);
  });
});
