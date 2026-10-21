import "@/lib/evidence-graph/evidence-graph-test-env";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  InterviewerCategory,
  JobStatus,
  PortalRole,
} from "@prisma/client";
import { transitionInterviewerApplicationStatus } from "@/app/actions/application-actions";
import { confirmClientCandidateHire } from "@/app/actions/application-actions";
import { submitInterviewerHiringRecommendation } from "@/app/actions/evaluation-actions";
import { AuthorizationError } from "@/lib/auth/authorization";
import { ApplicationValidationError } from "@/lib/validation/application-validation";
import { EvaluationValidationError } from "@/lib/validation/evaluation-validation";
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









const MARKER = `rec-${process.pid}-${Date.now()}`;

function asUser(id: number) {
  actor.id = String(id);
}

describe.skipIf(integrationDatabase.mode === "skip")("interviewer hiring recommendations", () => {
  const companyIds: number[] = [];
  const userIds: number[] = [];
  const interviewerIds: number[] = [];
  const memberIds: number[] = [];
  const jobIds: number[] = [];
  const candidateIds: number[] = [];
  const applicationIds: number[] = [];
  const evaluationIds: number[] = [];

  afterAll(async () => {
    const companies = companyIds.filter((id) => id > 0);
    const users = userIds.filter((id) => id > 0);
    const interviewers = interviewerIds.filter((id) => id > 0);
    const members = memberIds.filter((id) => id > 0);
    const jobs = jobIds.filter((id) => id > 0);
    const candidates = candidateIds.filter((id) => id > 0);
    const applications = applicationIds.filter((id) => id > 0);
    const evaluations = evaluationIds.filter((id) => id > 0);
    if (
      companies.length +
        users.length +
        interviewers.length +
        members.length +
        jobs.length +
        candidates.length +
        applications.length +
        evaluations.length ===
      0
    ) {
      return;
    }

    const failures: string[] = [];
    const attempt = async (step: string, run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch (error) {
        failures.push(`${step}: ${error instanceof Error ? error.message : "cleanup failed"}`);
        return false;
      }
    };

    // OutcomeEvent restricts Application, Job, and User. Evaluation restricts
    // Application and Interviewer. Those two deletes do not depend on each other.
    // OrganizationMember restricts User and Company. Candidate and Job both wait
    // on Application, then are independent. Company waits on its children.
    // Interviewer waits on Evaluation, Job, and User, and does not block Company.
    let outcomesGone = applications.length === 0;
    if (applications.length > 0) {
      outcomesGone = await attempt("outcome events", () =>
        prisma.outcomeEvent.deleteMany({ where: { applicationId: { in: applications } } }));
    }
    let evaluationsGone = applications.length === 0 && evaluations.length === 0;
    if (applications.length > 0 || evaluations.length > 0) {
      const evaluationWhere =
        evaluations.length > 0 && applications.length > 0
          ? { OR: [{ id: { in: evaluations } }, { applicationId: { in: applications } }] }
          : evaluations.length > 0
            ? { id: { in: evaluations } }
            : { applicationId: { in: applications } };
      evaluationsGone = await attempt("evaluations", () =>
        prisma.evaluation.deleteMany({ where: evaluationWhere }));
    }
    let membersGone = members.length === 0;
    if (members.length > 0) {
      membersGone = await attempt("organization members", () =>
        prisma.organizationMember.deleteMany({ where: { id: { in: members } } }));
    }
    let applicationsGone = applications.length === 0;
    if (outcomesGone && evaluationsGone && applications.length > 0) {
      applicationsGone = await attempt("applications", () =>
        prisma.application.deleteMany({ where: { id: { in: applications } } }));
    }
    let candidatesGone = candidates.length === 0;
    if (applicationsGone && candidates.length > 0) {
      candidatesGone = await attempt("candidates", () =>
        prisma.candidate.deleteMany({ where: { id: { in: candidates } } }));
    }
    let jobsGone = jobs.length === 0;
    if (outcomesGone && applicationsGone && jobs.length > 0) {
      jobsGone = await attempt("jobs", () =>
        prisma.job.deleteMany({ where: { id: { in: jobs } } }));
    }
    let usersGone = users.length === 0;
    if (membersGone && outcomesGone && users.length > 0) {
      usersGone = await attempt("users", () =>
        prisma.user.deleteMany({ where: { id: { in: users } } }));
    }
    if (evaluationsGone && jobsGone && usersGone && interviewers.length > 0) {
      await attempt("interviewers", () =>
        prisma.interviewer.deleteMany({ where: { id: { in: interviewers } } }));
    }
    if (
      outcomesGone &&
      applicationsGone &&
      candidatesGone &&
      jobsGone &&
      membersGone &&
      usersGone &&
      companies.length > 0
    ) {
      await attempt("companies", () =>
        prisma.company.deleteMany({ where: { id: { in: companies } } }));
    }
    if (failures.length > 0) {
      throw new Error(`Hiring recommendation fixture cleanup failed.\n${failures.join("\n")}`);
    }
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
    companyIds.push(companyA.id);
    const companyB = await prisma.company.create({
      data: {
        name: `${MARKER} b`,
        industry: "Test",
        employees: 1,
        publicSlug: `${MARKER}-b`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      },
    });
    companyIds.push(companyB.id);

    const profileA = await prisma.interviewer.create({
      data: { name: `${MARKER} a`, category: InterviewerCategory.ENGINEERING },
    });
    interviewerIds.push(profileA.id);
    const profileB = await prisma.interviewer.create({
      data: { name: `${MARKER} b`, category: InterviewerCategory.ENGINEERING },
    });
    interviewerIds.push(profileB.id);

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
    const membership = await prisma.organizationMember.create({
      data: {
        userId: memberA,
        companyId: companyA.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
    memberIds.push(membership.id);

    async function application(companyId: number, interviewerId: number) {
      const job = await prisma.job.create({
        data: {
          title: `${MARKER} ${companyId}`,
          status: JobStatus.OPEN,
          companyId,
          assignedInterviewerId: interviewerId,
        },
      });
      jobIds.push(job.id);
      const candidate = await prisma.candidate.create({
        data: {
          name: `${MARKER} ${companyId}`,
          role: "Engineer",
          experienceYears: 2,
          status: CandidateStatus.APPLIED,
          companyId,
        },
      });
      candidateIds.push(candidate.id);
      const created = await prisma.application.create({
        data: {
          candidateId: candidate.id,
          jobId: job.id,
          companyId,
          status: ApplicationPipelineStatus.TECH_EVALUATION,
        },
      });
      applicationIds.push(created.id);
      return created;
    }

    const applicationA = await application(companyA.id, profileA.id);
    const applicationB = await application(companyB.id, profileB.id);

    asUser(userA);
    const hire = await submitInterviewerHiringRecommendation(
      applicationA.id,
      "HIRE",
      "Strong system design.",
    );
    evaluationIds.push(hire.id);
    expect(hire.recommendation).toBe("HIRE");
    expect(hire.notes).toBe("Strong system design.");
    const noHire = await submitInterviewerHiringRecommendation(
      applicationA.id,
      "NO_HIRE",
      "Missing production experience.",
    );
    evaluationIds.push(noHire.id);
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
