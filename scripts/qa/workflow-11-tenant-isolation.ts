import {
  applicationScopeWhere,
  assertClientCompanyAccess,
  assertInterviewerJobAccess,
  assertJobAccessible,
  jobScopeWhere,
  notificationScopeWhere,
  AuthorizationError,
} from "../../lib/auth/authorization";
import { assert, assertThrows } from "./assertions";
import {
  cleanupPrefix,
  createTmpApplication,
  createTmpJob,
  loadV1Qa,
  prisma,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W11`;

export async function runWorkflow11() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W11 tenant isolation");

    const alphaJob = await createTmpJob({
      prefix: PREFIX,
      title: "Alpha Tenant",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const betaJob = await createTmpJob({
      prefix: PREFIX,
      title: "Beta Tenant",
      companyId: qa.companyBeta.id,
      assignedInterviewerId: qa.interviewerBeta.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const { application: alphaApp } = await createTmpApplication({
      prefix: PREFIX,
      jobId: alphaJob.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "AlphaApp",
    });
    const { application: betaApp } = await createTmpApplication({
      prefix: PREFIX,
      jobId: betaJob.id,
      companyId: qa.companyBeta.id,
      status: "SHORTLISTED",
      label: "BetaApp",
    });

    assertClientCompanyAccess(qa.clientAlpha, qa.companyAlpha.id);
    await assertThrows(
      () => assertClientCompanyAccess(qa.clientAlpha, qa.companyBeta.id),
      (error) => error instanceof AuthorizationError,
      "Alpha Client denied Beta company",
    );
    await assertThrows(
      () => assertClientCompanyAccess(qa.clientBeta, qa.companyAlpha.id),
      (error) => error instanceof AuthorizationError,
      "Beta Client denied Alpha company",
    );

    assertJobAccessible(qa.clientAlpha, alphaJob);
    await assertThrows(
      () => assertJobAccessible(qa.clientAlpha, betaJob),
      (error) => error instanceof AuthorizationError,
      "Alpha Client cannot access Beta requirement",
    );
    await assertThrows(
      () => assertJobAccessible(qa.clientBeta, alphaJob),
      (error) => error instanceof AuthorizationError,
      "Beta Client cannot access Alpha requirement",
    );

    assertInterviewerJobAccess(qa.interviewerAlphaUser, alphaJob);
    await assertThrows(
      () => assertInterviewerJobAccess(qa.interviewerAlphaUser, betaJob),
      (error) => error instanceof AuthorizationError,
      "Alpha Interviewer cannot access Beta requirement",
    );
    await assertThrows(
      () => assertInterviewerJobAccess(qa.interviewerBetaUser, alphaJob),
      (error) => error instanceof AuthorizationError,
      "Beta Interviewer cannot access Alpha requirement",
    );

    const alphaJobs = await prisma.job.findMany({
      where: { AND: [jobScopeWhere(qa.clientAlpha), { id: { in: [alphaJob.id, betaJob.id] } }] },
      select: { id: true },
    });
    assert(
      alphaJobs.length === 1 && alphaJobs[0]?.id === alphaJob.id,
      "Client Alpha job scope is Alpha-only",
    );

    const betaJobs = await prisma.job.findMany({
      where: { AND: [jobScopeWhere(qa.clientBeta), { id: { in: [alphaJob.id, betaJob.id] } }] },
      select: { id: true },
    });
    assert(
      betaJobs.length === 1 && betaJobs[0]?.id === betaJob.id,
      "Client Beta job scope is Beta-only",
    );

    const alphaInterviewerJobs = await prisma.job.findMany({
      where: {
        AND: [
          jobScopeWhere(qa.interviewerAlphaUser),
          { id: { in: [alphaJob.id, betaJob.id] } },
        ],
      },
    });
    assert(
      alphaInterviewerJobs.length === 1 &&
        alphaInterviewerJobs[0]?.id === alphaJob.id,
      "Interviewer Alpha sees assigned Alpha job only",
    );

    const alphaApps = await prisma.application.findMany({
      where: {
        AND: [
          applicationScopeWhere(qa.clientAlpha),
          { id: { in: [alphaApp.id, betaApp.id] } },
        ],
      },
    });
    assert(
      alphaApps.length === 1 && alphaApps[0]?.id === alphaApp.id,
      "Alpha Client cannot access Beta candidate",
    );

    const betaApps = await prisma.application.findMany({
      where: {
        AND: [
          applicationScopeWhere(qa.clientBeta),
          { id: { in: [alphaApp.id, betaApp.id] } },
        ],
      },
    });
    assert(
      betaApps.length === 1 && betaApps[0]?.id === betaApp.id,
      "Beta Client cannot access Alpha candidate",
    );

    const alphaInterviewerApps = await prisma.application.findMany({
      where: {
        AND: [
          applicationScopeWhere(qa.interviewerAlphaUser),
          { id: { in: [alphaApp.id, betaApp.id] } },
        ],
      },
    });
    assert(
      alphaInterviewerApps.length === 1 &&
        alphaInterviewerApps[0]?.id === alphaApp.id,
      "Alpha Interviewer cannot access Beta candidate",
    );

    const idorJob = await prisma.job.findFirst({
      where: { id: betaJob.id, ...jobScopeWhere(qa.clientAlpha) },
    });
    assert(idorJob === null, "IDOR: Alpha Client direct Beta job id returns empty");

    const idorApp = await prisma.application.findFirst({
      where: {
        id: betaApp.id,
        jobId: betaJob.id,
        ...applicationScopeWhere(qa.clientAlpha),
      },
    });
    assert(idorApp === null, "IDOR: Alpha Client direct Beta application id returns empty");

    const idorInterviewer = await prisma.job.findFirst({
      where: { id: betaJob.id, ...jobScopeWhere(qa.interviewerAlphaUser) },
    });
    assert(
      idorInterviewer === null,
      "IDOR: Alpha Interviewer direct Beta requirement id returns empty",
    );

    const mutateBeta = await prisma.application.updateMany({
      where: {
        id: betaApp.id,
        job: { assignedInterviewerId: qa.interviewerAlpha.id },
      },
      data: { status: "REJECTED" },
    });
    assert(mutateBeta.count === 0, "Alpha Interviewer cannot mutate Beta candidate");

    const betaNotes = await prisma.notification.findMany({
      where: {
        AND: [
          notificationScopeWhere(qa.clientAlpha),
          { jobId: betaJob.id },
        ],
      },
    });
    assert(betaNotes.length === 0, "Alpha Client cannot see Beta notifications");

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
