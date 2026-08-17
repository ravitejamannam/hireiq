/**
 * T81.1: Client requirement submission.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * submitClientRequirement requires Auth.js request scope.
 *
 * This workflow tests the production function that action calls
 * (submitClientRequirementForCompany), plus portal authorization
 * predicates and source scans. It is not a Playwright browser suite
 * and does not fake Auth.js.
 */
import { JobSpecificationVersionStatus } from "@prisma/client";

import { hashPassword } from "../../lib/auth/password";
import {
  AuthorizationError,
  authorizeClientPortalAccess,
  hydrateAuthUser,
} from "../../lib/auth/authorization";
import {
  CLIENT_REQUIREMENT_NOT_SUBMITTABLE_ERROR,
  submitClientRequirementForCompany,
} from "../../lib/jobs/client-requirement-submission";
import { upsertDraftSpecification } from "../../lib/jobs/job-specification";
import { createClientRequirementDraftForCompany } from "../../lib/organizations/client-requirement-draft";
import { JobValidationError } from "../../lib/validation/job-validation";
import {
  assert,
  assertIncludes,
  assertNotIncludes,
  assertThrows,
} from "./assertions";
import {
  cleanupPrefix,
  createTmpJob,
  loadV1Qa,
  prisma,
  source,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W22`;
const EMAIL_PREFIX = "tmp-full-qa-w22";

async function cleanupW22() {
  await cleanupPrefix(PREFIX);

  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length) {
    await prisma.organizationMember.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { invitedByUserId: { in: userIds } }],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
}

async function createClientUser(params: {
  email: string;
  companyId: number | null;
  emailVerifiedAt: Date | null;
}) {
  return prisma.user.create({
    data: {
      email: params.email,
      name: `${PREFIX} Client`,
      role: "CLIENT",
      passwordHash: await hashPassword("V1QaPass123!"),
      companyId: params.companyId,
      emailVerifiedAt: params.emailVerifiedAt,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      interviewerId: true,
      emailVerifiedAt: true,
    },
  });
}

function completeSpec(title: string) {
  return {
    title,
    roleCategory: "ENGINEERING" as const,
    experienceRange: "5-8 years",
    location: "Bengaluru",
    compensationRange: "30-40 LPA",
    targetHireDate: new Date("2026-12-01T00:00:00.000Z"),
    numberOfPositions: 1,
    mustHaveRequirements: "Must have TypeScript",
    niceToHaveRequirements: "Nice to have AWS",
    jobDescription: "Build hiring software.",
    evaluationCriteria: "Quality and communication.",
    primarySkills: "TypeScript, PostgreSQL",
  };
}

async function createCompleteDraft(params: {
  title: string;
  companyId: number;
}) {
  const job = await createTmpJob({
    prefix: PREFIX,
    title: params.title,
    companyId: params.companyId,
    assignedInterviewerId: null,
    requirementLifecycle: "REQUIREMENT_DRAFTED",
  });
  await upsertDraftSpecification({
    jobId: job.id,
    lifecycle: "REQUIREMENT_DRAFTED",
    fields: completeSpec(`${PREFIX} ${params.title}`),
  });
  return job;
}

function timestampSnapshot(job: {
  clientCompletedAt: Date | null;
  sourcingAccessReceivedAt: Date | null;
  shortlistingDueAt: Date | null;
  shortlistingCompletedAt: Date | null;
}) {
  return {
    clientCompletedAt: job.clientCompletedAt?.getTime() ?? null,
    sourcingAccessReceivedAt: job.sourcingAccessReceivedAt?.getTime() ?? null,
    shortlistingDueAt: job.shortlistingDueAt?.getTime() ?? null,
    shortlistingCompletedAt: job.shortlistingCompletedAt?.getTime() ?? null,
  };
}

export async function runWorkflow22() {
  await cleanupW22();
  const qa = await loadV1Qa();

  try {
    console.log("W22 client requirement submission");

    const jobActions = source("app/actions/job-actions.ts");
    const submission = source("lib/jobs/client-requirement-submission.ts");
    const authJsSource = source("auth.ts");
    const workspace = source(
      "components/client/ClientRequirementWorkspace.tsx",
    );
    const runAll = source("scripts/qa/run-all.ts");

    const submitActionSource =
      jobActions
        .split("export async function submitClientRequirement")[1]
        ?.split("export async function")[0] ?? "";

    assertIncludes(
      jobActions,
      "export async function submitClientRequirement(jobId: number)",
      "J: submit action accepts only jobId",
    );
    assertIncludes(
      submitActionSource,
      "const client = await requireClientPortal()",
      "J: submit uses requireClientPortal",
    );
    assertIncludes(
      submitActionSource,
      "companyId: client.companyId",
      "J: submit scopes by membership companyId",
    );
    assertNotIncludes(
      submitActionSource,
      "organizationMemberId",
      "J: submit does not accept organizationMemberId",
    );
    assertNotIncludes(
      submitActionSource,
      "specificationVersionId",
      "J: submit does not accept specificationVersionId as an argument",
    );
    assertNotIncludes(
      submitActionSource,
      "completeJobRequirement",
      "submitClientRequirement does not call completeJobRequirement",
    );
    assertIncludes(
      submission,
      "validateJobRequirementCompletion",
      "E: submission reuses the T81 completeness validator",
    );
    assertIncludes(
      submission,
      "readEditableJobSpecification",
      "A: submission reads the T81 editable specification",
    );
    assertIncludes(
      submission,
      'requirementLifecycle: "CLIENT_NOTIFIED"',
      "A: submission writes CLIENT_NOTIFIED",
    );
    assertIncludes(
      submission,
      'requirementLifecycle: "REQUIREMENT_DRAFTED"',
      "A: submission updateMany requires REQUIREMENT_DRAFTED",
    );
    assertNotIncludes(
      submission,
      "publishDraftSpecification",
      "I: submission does not publish a specification",
    );
    assertNotIncludes(
      submission,
      "clientCompletedAt",
      "H: submission source does not mention clientCompletedAt",
    );
    assertNotIncludes(
      submission,
      "completeJobRequirement",
      "submission does not complete the requirement",
    );
    assertIncludes(
      workspace,
      "submitClientRequirement",
      "UI calls the Client submission action",
    );
    assertIncludes(
      workspace,
      "Submit Requirement",
      "UI shows Submit Requirement",
    );
    assertNotIncludes(
      authJsSource,
      "token.companyId",
      "K: JWT does not store companyId",
    );
    assertIncludes(runAll, "runWorkflow01", "L: W01 remains in the full suite");
    assertIncludes(runAll, "runWorkflow21", "L: W21 remains in the full suite");
    assertIncludes(runAll, "runWorkflow22", "L: W22 is registered");

    const drafted = await createCompleteDraft({
      title: "Owner Submit",
      companyId: qa.companyAlpha.id,
    });
    const beforeSubmit = await prisma.job.findUniqueOrThrow({
      where: { id: drafted.id },
      include: { specificationVersions: true },
    });
    const beforeTimestamps = timestampSnapshot(beforeSubmit);
    const beforeVersions = beforeSubmit.specificationVersions.map((version) => ({
      id: version.id,
      status: version.status,
      versionNumber: version.versionNumber,
      title: version.title,
      updatedAt: version.updatedAt.getTime(),
      publishedAt: version.publishedAt?.getTime() ?? null,
    }));

    const submitted = await submitClientRequirementForCompany({
      jobId: drafted.id,
      companyId: qa.companyAlpha.id,
    });
    assert(
      submitted.requirementLifecycle === "CLIENT_NOTIFIED",
      "A: verified Client/OWNER company can submit DRAFTED → CLIENT_NOTIFIED",
    );
    assert(
      submitted.currentPublishedSpecificationVersionId ===
        beforeSubmit.currentPublishedSpecificationVersionId,
      "I: submission does not change the published pointer",
    );

    const memberUser = await createClientUser({
      email: `${EMAIL_PREFIX}-member@hireiq.local`,
      companyId: qa.companyAlpha.id,
      emailVerifiedAt: new Date(),
    });
    await prisma.organizationMember.create({
      data: {
        companyId: qa.companyAlpha.id,
        userId: memberUser.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
    const memberDraft = await createCompleteDraft({
      title: "Member Submit",
      companyId: qa.companyAlpha.id,
    });
    const memberSubmitted = await submitClientRequirementForCompany({
      jobId: memberDraft.id,
      companyId: qa.companyAlpha.id,
    });
    assert(
      memberSubmitted.requirementLifecycle === "CLIENT_NOTIFIED",
      "A: MEMBER may submit; submission is not OWNER-only",
    );

    const unverified = await createClientUser({
      email: `${EMAIL_PREFIX}-unverified@hireiq.local`,
      companyId: qa.companyAlpha.id,
      emailVerifiedAt: null,
    });
    await prisma.organizationMember.create({
      data: {
        companyId: qa.companyAlpha.id,
        userId: unverified.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
    const unverifiedJob = await createTmpJob({
      prefix: PREFIX,
      title: "Unverified",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: null,
      requirementLifecycle: "REQUIREMENT_DRAFTED",
    });
    const unverifiedHydrated = await hydrateAuthUser(unverified);
    await assertThrows(
      () => authorizeClientPortalAccess(unverifiedHydrated),
      (error) => error instanceof AuthorizationError,
      "B: unverified Client cannot use the Client portal",
    );
    const unverifiedAfter = await prisma.job.findUniqueOrThrow({
      where: { id: unverifiedJob.id },
      select: { requirementLifecycle: true },
    });
    assert(
      unverifiedAfter.requirementLifecycle === "REQUIREMENT_DRAFTED",
      "B: unverified Client rejection does not mutate lifecycle",
    );

    const noMembership = await createClientUser({
      email: `${EMAIL_PREFIX}-nomember@hireiq.local`,
      companyId: null,
      emailVerifiedAt: new Date(),
    });
    const noMembershipHydrated = await hydrateAuthUser(noMembership);
    assert(
      noMembershipHydrated.companyId === null,
      "C: Client without ACTIVE membership has no companyId",
    );
    await assertThrows(
      () => authorizeClientPortalAccess(noMembershipHydrated),
      (error) => error instanceof AuthorizationError,
      "C: Client without ACTIVE membership is rejected",
    );

    const betaJob = await createTmpJob({
      prefix: PREFIX,
      title: "Beta Isolation",
      companyId: qa.companyBeta.id,
      assignedInterviewerId: null,
      requirementLifecycle: "REQUIREMENT_DRAFTED",
    });
    await assertThrows(
      () =>
        submitClientRequirementForCompany({
          jobId: betaJob.id,
          companyId: qa.companyAlpha.id,
        }),
      "Requirement not found.",
      "D: Alpha cannot submit a Beta Job",
    );
    const betaAfter = await prisma.job.findUniqueOrThrow({
      where: { id: betaJob.id },
      select: { requirementLifecycle: true, companyId: true },
    });
    assert(
      betaAfter.requirementLifecycle === "REQUIREMENT_DRAFTED" &&
        betaAfter.companyId === qa.companyBeta.id,
      "D: Beta Job is unchanged after the cross-company attempt",
    );

    const incomplete = await createClientRequirementDraftForCompany({
      companyId: qa.companyAlpha.id,
      title: `${PREFIX} Incomplete`,
    });
    await assertThrows(
      () =>
        submitClientRequirementForCompany({
          jobId: incomplete.id,
          companyId: qa.companyAlpha.id,
        }),
      (error) =>
        error instanceof JobValidationError &&
        error.message === "Role category is required.",
      "E: incomplete specification is rejected with the T81 validator",
    );
    const incompleteAfter = await prisma.job.findUniqueOrThrow({
      where: { id: incomplete.id },
      select: { requirementLifecycle: true },
    });
    assert(
      incompleteAfter.requirementLifecycle === "REQUIREMENT_DRAFTED",
      "E: incomplete submission does not mutate lifecycle",
    );

    const alreadyNotified = await createTmpJob({
      prefix: PREFIX,
      title: "Already Notified",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: null,
      requirementLifecycle: "CLIENT_NOTIFIED",
    });
    await assertThrows(
      () =>
        submitClientRequirementForCompany({
          jobId: alreadyNotified.id,
          companyId: qa.companyAlpha.id,
        }),
      CLIENT_REQUIREMENT_NOT_SUBMITTABLE_ERROR,
      "F: CLIENT_NOTIFIED cannot be submitted again",
    );
    const notifiedAfter = await prisma.job.findUniqueOrThrow({
      where: { id: alreadyNotified.id },
      select: { requirementLifecycle: true },
    });
    assert(
      notifiedAfter.requirementLifecycle === "CLIENT_NOTIFIED",
      "F: CLIENT_NOTIFIED Job is unchanged",
    );

    const alreadyPosted = await createTmpJob({
      prefix: PREFIX,
      title: "Already Posted",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "REQUIREMENT_POSTED",
    });
    await assertThrows(
      () =>
        submitClientRequirementForCompany({
          jobId: alreadyPosted.id,
          companyId: qa.companyAlpha.id,
        }),
      CLIENT_REQUIREMENT_NOT_SUBMITTABLE_ERROR,
      "F: REQUIREMENT_POSTED cannot be submitted",
    );
    const postedAfter = await prisma.job.findUniqueOrThrow({
      where: { id: alreadyPosted.id },
      select: { requirementLifecycle: true },
    });
    assert(
      postedAfter.requirementLifecycle === "REQUIREMENT_POSTED",
      "F: REQUIREMENT_POSTED Job is unchanged",
    );

    const concurrentJob = await createCompleteDraft({
      title: "Concurrent",
      companyId: qa.companyAlpha.id,
    });
    const concurrentResults = await Promise.allSettled([
      submitClientRequirementForCompany({
        jobId: concurrentJob.id,
        companyId: qa.companyAlpha.id,
      }),
      submitClientRequirementForCompany({
        jobId: concurrentJob.id,
        companyId: qa.companyAlpha.id,
      }),
    ]);
    const concurrentWins = concurrentResults.filter(
      (result) => result.status === "fulfilled",
    );
    const concurrentLosses = concurrentResults.filter(
      (result) => result.status === "rejected",
    );
    assert(concurrentWins.length === 1, "G: exactly one concurrent submit wins");
    assert(
      concurrentLosses.length === 1,
      "G: exactly one concurrent submit fails",
    );
    const concurrentFinal = await prisma.job.findUniqueOrThrow({
      where: { id: concurrentJob.id },
      select: { requirementLifecycle: true },
    });
    assert(
      concurrentFinal.requirementLifecycle === "CLIENT_NOTIFIED",
      "G: concurrent final state is CLIENT_NOTIFIED",
    );

    const afterSubmit = await prisma.job.findUniqueOrThrow({
      where: { id: drafted.id },
      include: { specificationVersions: true },
    });
    assert(
      JSON.stringify(timestampSnapshot(afterSubmit)) ===
        JSON.stringify(beforeTimestamps),
      "H: submission does not plant workflow timestamps",
    );
    const afterVersions = afterSubmit.specificationVersions.map((version) => ({
      id: version.id,
      status: version.status,
      versionNumber: version.versionNumber,
      title: version.title,
      updatedAt: version.updatedAt.getTime(),
      publishedAt: version.publishedAt?.getTime() ?? null,
    }));
    assert(
      JSON.stringify(afterVersions) === JSON.stringify(beforeVersions),
      "I: submission does not create, delete, or mutate specification versions",
    );
    assert(
      afterSubmit.specificationVersions.every(
        (version) => version.status !== JobSpecificationVersionStatus.PUBLISHED ||
          beforeVersions.some((before) => before.id === version.id),
      ),
      "I: no published specification was mutated or added",
    );

    await cleanupW22();
  } catch (error) {
    await cleanupW22().catch(() => undefined);
    throw error;
  }
}
