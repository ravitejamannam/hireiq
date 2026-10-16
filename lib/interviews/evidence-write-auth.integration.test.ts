import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  CodingTestStatus,
  InterviewResult,
  InterviewType,
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

import {
  createCodingTest,
  deleteCodingTest,
  updateCodingTest,
} from "@/app/actions/coding-test-actions";
import {
  createInterview,
  deleteInterview,
  updateInterview,
} from "@/app/actions/interview-actions";
import { AuthorizationError } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

const MARKER = `evidence-${process.pid}-${Date.now()}`;
const WHEN = new Date("2026-10-01T00:00:00.000Z");

function asUser(id: number) {
  actor.id = String(id);
}

describe("interview and coding-test writes", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];

  afterAll(async () => {
    if (companyIds.length === 0) return;
    await prisma.interview.deleteMany({
      where: { application: { companyId: { in: companyIds } } },
    });
    await prisma.codingTest.deleteMany({
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

  it("keeps interview and coding-test writes on the assigned job", async () => {
    async function company(label: string) {
      const created = await prisma.company.create({
        data: {
          name: `${MARKER} ${label}`,
          industry: "Test",
          employees: 1,
          publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        },
      });
      companyIds.push(created.id);
      return created;
    }

    const companyA = await company("a");
    const companyB = await company("b");
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
    const client = await user("client", PortalRole.CLIENT, companyA.id, null);
    await prisma.organizationMember.create({
      data: {
        userId: client,
        companyId: companyA.id,
        role: "OWNER",
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

    asUser(userB);
    const interviewB = await createInterview(
      applicationB.id,
      InterviewType.TECHNICAL,
      WHEN,
      InterviewResult.PENDING,
    );
    const codingB = await createCodingTest(
      applicationB.id,
      `${MARKER} other test`,
      1,
      10,
      CodingTestStatus.PENDING,
      WHEN,
    );

    asUser(userA);
    const interviewA = await createInterview(
      applicationA.id,
      InterviewType.PHONE_SCREEN,
      WHEN,
      InterviewResult.PENDING,
    );
    const updatedInterview = await updateInterview(
      interviewA.id,
      applicationA.id,
      InterviewType.HR,
      WHEN,
      InterviewResult.PASSED,
    );
    expect(updatedInterview.result).toBe(InterviewResult.PASSED);

    const codingA = await createCodingTest(
      applicationA.id,
      `${MARKER} own test`,
      2,
      10,
      CodingTestStatus.PENDING,
      WHEN,
    );
    const updatedCoding = await updateCodingTest(
      codingA.id,
      applicationA.id,
      `${MARKER} own test`,
      8,
      10,
      CodingTestStatus.COMPLETED,
      WHEN,
    );
    expect(updatedCoding.score).toBe(8);

    const interviewsBefore = await prisma.interview.count({
      where: { applicationId: applicationB.id },
    });
    const testsBefore = await prisma.codingTest.count({
      where: { applicationId: applicationB.id },
    });

    await expect(
      createInterview(applicationB.id, InterviewType.HR, WHEN, InterviewResult.FAILED),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      updateInterview(
        interviewB.id,
        applicationB.id,
        InterviewType.HR,
        WHEN,
        InterviewResult.FAILED,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      updateInterview(
        interviewB.id,
        applicationA.id,
        InterviewType.HR,
        WHEN,
        InterviewResult.FAILED,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(deleteInterview(interviewB.id)).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      createCodingTest(applicationB.id, "stolen", 9, 10, CodingTestStatus.COMPLETED, WHEN),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      updateCodingTest(
        codingB.id,
        applicationB.id,
        "stolen",
        9,
        10,
        CodingTestStatus.COMPLETED,
        WHEN,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      updateCodingTest(
        codingB.id,
        applicationA.id,
        "stolen",
        9,
        10,
        CodingTestStatus.COMPLETED,
        WHEN,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(deleteCodingTest(codingB.id)).rejects.toBeInstanceOf(AuthorizationError);

    expect(await prisma.interview.count({ where: { applicationId: applicationB.id } })).toBe(
      interviewsBefore,
    );
    expect(await prisma.codingTest.count({ where: { applicationId: applicationB.id } })).toBe(
      testsBefore,
    );
    expect(
      (await prisma.interview.findUnique({
        where: { id: interviewB.id },
        select: { result: true, type: true, applicationId: true },
      })),
    ).toEqual({
      result: InterviewResult.PENDING,
      type: InterviewType.TECHNICAL,
      applicationId: applicationB.id,
    });
    expect(
      (await prisma.codingTest.findUnique({
        where: { id: codingB.id },
        select: { title: true, score: true, status: true, applicationId: true },
      })),
    ).toEqual({
      title: `${MARKER} other test`,
      score: 1,
      status: CodingTestStatus.PENDING,
      applicationId: applicationB.id,
    });
    expect(
      (await prisma.application.findUnique({
        where: { id: applicationB.id },
        select: { status: true },
      }))?.status,
    ).toBe(ApplicationPipelineStatus.TECH_EVALUATION);

    await deleteInterview(interviewA.id);
    await deleteCodingTest(codingA.id);
    expect(await prisma.interview.findUnique({ where: { id: interviewA.id } })).toBeNull();
    expect(await prisma.codingTest.findUnique({ where: { id: codingA.id } })).toBeNull();
    expect(await prisma.interview.findUnique({ where: { id: interviewB.id } })).not.toBeNull();

    asUser(client);
    await expect(
      createInterview(applicationA.id, InterviewType.HR, WHEN, InterviewResult.FAILED),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(await prisma.interview.count({ where: { applicationId: applicationA.id } })).toBe(0);
  });
});
