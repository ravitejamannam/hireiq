/**
 * T83: provider-neutral job distribution foundation.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * createJobDistribution / publishJobDistribution / retryJobDistribution /
 * pauseJobDistribution / closeJobDistribution / connectProvider require
 * Auth.js request scope.
 *
 * LIVE_PROVIDER_NOT_TESTED
 * LinkedIn, Indeed, and Naukri adapters are UnavailableProvider.
 * This workflow never opens a network socket to a job board.
 */
import {
  ApplyMode,
  DistributionProvider,
  JobSpecificationVersionStatus,
  Prisma,
} from "@prisma/client";

import { hashPassword } from "../../lib/auth/password";
import { authorizeClientPortalAccess, hydrateAuthUser } from "../../lib/auth/authorization";
import {
  encryptCredentialSecret,
  isCredentialEncryptionConfigured,
} from "../../lib/crypto/credential-encryption";
import {
  upsertProviderConnectionForCompany,
  listProviderConnectionsForCompany,
} from "../../lib/jobs/distribution/connection-service";
import {
  closeJobDistributionForCompany,
  createJobDistributionForCompany,
  listJobDistributionsForJob,
  pauseJobDistributionForCompany,
  publishJobDistributionForCompany,
  retryJobDistributionForCompany,
} from "../../lib/jobs/distribution/distribution-service";
import {
  assertPayloadHasNoInternalFields,
  buildPublicDistributionPayload,
} from "../../lib/jobs/distribution/payload";
import { canTransitionDistribution } from "../../lib/jobs/distribution/state-machine";
import { tryMutatePublishedSpecification } from "../../lib/jobs/job-specification";
import {
  CONNECTION_REQUIRED,
  DUPLICATE_DISTRIBUTION,
  JOB_NOT_FOUND,
  PUBLISHED_SPEC_REQUIRED,
  assertDistributionTransition,
} from "../../lib/validation/job-distribution-validation";
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

const PREFIX = `${TMP_PREFIX}-W24`;
const TEST_KEY = Buffer.alloc(32, 9).toString("base64");

async function cleanupW24() {
  await cleanupPrefix(PREFIX);
  await prisma.providerConnection.deleteMany({
    where: { providerAccountId: { startsWith: PREFIX } },
  });
}

function publishedJob(params: { title: string; companyId: number }) {
  return createTmpJob({
    prefix: PREFIX,
    title: params.title,
    companyId: params.companyId,
    assignedInterviewerId: null,
    requirementLifecycle: "REQUIREMENT_POSTED",
  });
}

async function connectUnavailable(
  companyId: number,
  provider: DistributionProvider,
) {
  return upsertProviderConnectionForCompany({
    companyId,
    provider,
    providerAccountId: `${PREFIX}-${provider.toLowerCase()}`,
    credential: "test-credential-not-for-live-use",
  });
}

export async function runWorkflow24() {
  await cleanupW24();
  const qa = await loadV1Qa();
  const previousKey = process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY;
  process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;

  try {
    console.log("W24 job distribution");
    console.log("AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED");
    console.log("LIVE_PROVIDER_NOT_TESTED");

    const schema = source("prisma/schema.prisma");
    const jobActions = source("app/actions/job-actions.ts");
    const distActions = source("app/actions/distribution-actions.ts");
    const distService = source("lib/jobs/distribution/distribution-service.ts");
    const payloadSrc = source("lib/jobs/distribution/payload.ts");
    const authSrc = source("auth.ts");
    const appValidation = source("lib/validation/application-validation.ts");

    assertIncludes(
      schema,
      "enum SourcingDatabaseSource {\n  LINKEDIN\n  NAUKRI\n}",
      "O/P: T69 enum unchanged",
    );
    assertIncludes(schema, "source SourcingDatabaseSource?", "P: Application.source unchanged");
    assertIncludes(schema, "enum DistributionProvider", "T83 provider enum exists");
    assertNotIncludes(schema, "model ApplicationIngestionEvent", "no T85 ingestion model");
    assertNotIncludes(jobActions, "createJobDistribution", "V: complete path has no distribution");
    assertNotIncludes(jobActions, "publishJobDistribution", "V: complete does not auto-distribute");
    assertIncludes(
      distActions,
      "export async function createJobDistribution(input: {\n  jobId: unknown;\n  provider: unknown;",
      "M: create action input is jobId/provider, not companyId",
    );
    assertNotIncludes(distActions, "specificationVersionId", "N: no browser spec version authority");
    assertIncludes(authSrc, "token.id = user.id", "JWT still sets id");
    assertNotIncludes(
      authSrc.split("async jwt")[1] ?? "",
      "companyId",
      "N: JWT callback does not store companyId",
    );
    assertIncludes(payloadSrc, "evaluationCriteria", "payload module mentions the field only to exclude it");
    assertIncludes(payloadSrc, '!("evaluationCriteria" in record)', "never send evaluationCriteria");
    assertIncludes(distService, "currentPublishedSpecificationVersionId", "server pins published spec");
    assertNotIncludes(distService, "requirementLifecycle:", "V: distribution does not write lifecycle");
    assertIncludes(
      distActions,
      'if (client.membershipRole !== "OWNER")',
      "OWNER-only provider connect",
    );
    assertIncludes(
      appValidation,
      "SourcingDatabaseSource",
      "P: application source still T69 enum",
    );

    const draftJob = await createTmpJob({
      prefix: PREFIX,
      title: "Draft",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: null,
      requirementLifecycle: "REQUIREMENT_DRAFTED",
    });

    await assertThrows(
      () =>
        createJobDistributionForCompany({
          companyId: qa.companyAlpha.id,
          jobId: draftJob.id,
          provider: "MANUAL",
          applyMode: "EXTERNAL_URL",
          applyUrl: "https://example.com/apply",
        }),
      PUBLISHED_SPEC_REQUIRED,
      "A: draft job without published spec cannot distribute",
    );

    const draftVersion = await prisma.jobSpecificationVersion.findFirst({
      where: { jobId: draftJob.id, status: "DRAFT" },
    });
    assert(draftVersion, "B: draft version exists");
    await assertThrows(
      () =>
        createJobDistributionForCompany({
          companyId: qa.companyAlpha.id,
          jobId: draftJob.id,
          provider: "MANUAL",
          applyMode: "EXTERNAL_URL",
          applyUrl: "https://example.com/apply",
          specificationVersionId: draftVersion.id,
        }),
      PUBLISHED_SPEC_REQUIRED,
      "B: browser specificationVersionId cannot authorize a draft",
    );

    const posted = await publishedJob({
      title: "Posted",
      companyId: qa.companyAlpha.id,
    });
    const beforeLifecycle = (
      await prisma.job.findUniqueOrThrow({
        where: { id: posted.id },
        select: { requirementLifecycle: true },
      })
    ).requirementLifecycle;

    const hostedProbe = await publishedJob({
      title: "HostedProbe",
      companyId: qa.companyAlpha.id,
    });
    const hostedReady = await createJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      jobId: hostedProbe.id,
      provider: "MANUAL",
      applyMode: "HIREIQ_HOSTED",
      applyUrl: "https://evil.example/steal",
    });
    assert(hostedReady.applyMode === "HIREIQ_HOSTED", "R: HIREIQ_HOSTED can be created");
    assert(
      hostedReady.applyUrlSnapshot === null,
      "R: browser apply URL is ignored for hosted apply",
    );

    const manual = await createJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      jobId: posted.id,
      provider: "MANUAL",
      applyMode: "EXTERNAL_URL",
      applyUrl: "https://careers.example.com/apply/posted",
      includeCompensation: false,
      companyIdFromBrowser: qa.companyBeta.id,
      specificationVersionId: draftVersion.id,
    });

    assert(manual.status === "READY", "create starts READY");
    assert(
      manual.applyUrlSnapshot === "https://careers.example.com/apply/posted",
      "S: EXTERNAL_URL snapshot stored",
    );
    const publishedVersion = await prisma.job.findUniqueOrThrow({
      where: { id: posted.id },
      select: { currentPublishedSpecificationVersionId: true },
    });
    assert(
      manual.jobSpecificationVersionId ===
        publishedVersion.currentPublishedSpecificationVersionId,
      "K: pin uses current published version, not browser id",
    );

    await assertThrows(
      () =>
        createJobDistributionForCompany({
          companyId: qa.companyAlpha.id,
          jobId: posted.id,
          provider: "MANUAL",
          applyMode: "EXTERNAL_URL",
          applyUrl: "https://careers.example.com/apply/other",
        }),
      DUPLICATE_DISTRIBUTION,
      "E: duplicate active distribution prevented",
    );

    const raceJob = await publishedJob({
      title: "Race",
      companyId: qa.companyAlpha.id,
    });
    const [firstCreate, secondCreate] = await Promise.allSettled([
      createJobDistributionForCompany({
        companyId: qa.companyAlpha.id,
        jobId: raceJob.id,
        provider: "MANUAL",
        applyMode: "EXTERNAL_URL",
        applyUrl: "https://careers.example.com/apply/race",
      }),
      createJobDistributionForCompany({
        companyId: qa.companyAlpha.id,
        jobId: raceJob.id,
        provider: "MANUAL",
        applyMode: "EXTERNAL_URL",
        applyUrl: "https://careers.example.com/apply/race-2",
      }),
    ]);
    const createWins = [firstCreate, secondCreate].filter(
      (result) => result.status === "fulfilled",
    );
    const createLosses = [firstCreate, secondCreate].filter(
      (result) => result.status === "rejected",
    );
    assert(createWins.length === 1, "E concurrent: one active distribution wins");
    assert(createLosses.length === 1, "E concurrent: loser is rejected");

    const publishedManual = await publishJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      distributionId: manual.id,
    });
    assert(publishedManual.status === "PUBLISHED", "Manual EXTERNAL_URL can publish");
    assert(
      publishedManual.posting?.externalPostingId == null,
      "T: Manual does not fabricate external posting ids",
    );
    assert(
      publishedManual.posting?.providerStatus === "UNKNOWN",
      "T: Manual posting is UNKNOWN without provider confirmation",
    );

    const [pubA, pubB] = await Promise.allSettled([
      publishJobDistributionForCompany({
        companyId: qa.companyAlpha.id,
        distributionId: manual.id,
      }),
      publishJobDistributionForCompany({
        companyId: qa.companyAlpha.id,
        distributionId: manual.id,
      }),
    ]);
    const pubFulfilled = [pubA, pubB].filter((result) => result.status === "fulfilled");
    assert(pubFulfilled.length === 2, "F: already-published publish is idempotent");
    assert(
      pubFulfilled.every(
        (result) =>
          result.status === "fulfilled" && result.value.status === "PUBLISHED",
      ),
      "F: concurrent publish does not duplicate",
    );
    const attemptCount = await prisma.distributionAttempt.count({
      where: { distributionId: manual.id },
    });
    assert(attemptCount === 1, "F: idempotent re-publish does not add attempts");

    await connectUnavailable(qa.companyAlpha.id, "LINKEDIN");
    const linkedin = await createJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      jobId: posted.id,
      provider: "LINKEDIN",
      applyMode: "PROVIDER_NATIVE",
    });
    assert(linkedin.provider === "LINKEDIN", "J: second provider on same job");

    const failedLinkedin = await publishJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      distributionId: linkedin.id,
    });
    assert(failedLinkedin.status === "FAILED", "G: unavailable provider fails");
    assert(
      failedLinkedin.posting === null,
      "T: unavailable provider does not create a posting",
    );
    assert(
      failedLinkedin.latestAttempt?.status === "FAILED_PERMANENT",
      "G: failure is permanent for unavailable provider",
    );
    const linkedinAttemptsBefore = await prisma.distributionAttempt.count({
      where: { distributionId: linkedin.id },
    });

    const retried = await retryJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      distributionId: linkedin.id,
    });
    assert(retried.status === "FAILED", "H: retry of unavailable still fails");
    const linkedinAttemptsAfter = await prisma.distributionAttempt.count({
      where: { distributionId: linkedin.id },
    });
    assert(
      linkedinAttemptsAfter === linkedinAttemptsBefore + 1,
      "H: retry creates a new attempt",
    );

    await connectUnavailable(qa.companyAlpha.id, "INDEED");
    await assertThrows(
      () =>
        createJobDistributionForCompany({
          companyId: qa.companyBeta.id,
          jobId: posted.id,
          provider: "INDEED",
          applyMode: "EXTERNAL_URL",
          applyUrl: "https://example.com/beta",
        }),
      JOB_NOT_FOUND,
      "C/M: Beta companyId cannot distribute Alpha job",
    );

    const betaJob = await publishedJob({
      title: "Beta",
      companyId: qa.companyBeta.id,
    });
    await connectUnavailable(qa.companyBeta.id, "INDEED");
    const betaDist = await createJobDistributionForCompany({
      companyId: qa.companyBeta.id,
      jobId: betaJob.id,
      provider: "INDEED",
      applyMode: "EXTERNAL_URL",
      applyUrl: "https://example.com/beta-apply",
    });
    const alphaList = await listJobDistributionsForJob({
      jobId: posted.id,
      companyId: qa.companyAlpha.id,
    });
    assert(
      alphaList.every((row) => row.companyId === qa.companyAlpha.id),
      "C: list is tenant scoped",
    );
    assert(
      !alphaList.some((row) => row.id === betaDist.id),
      "C: Alpha list does not include Beta distribution",
    );

    await prisma.providerPosting.create({
      data: {
        distributionId: linkedin.id,
        provider: "LINKEDIN",
        externalPostingId: `${PREFIX}-ext-1`,
        providerStatus: "UNKNOWN",
      },
    });
    await assertThrows(
      () =>
        prisma.providerPosting.create({
          data: {
            distributionId: betaDist.id,
            provider: "LINKEDIN",
            externalPostingId: `${PREFIX}-ext-1`,
            providerStatus: "UNKNOWN",
          },
        }),
      (error) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002",
      "I: (provider, externalPostingId) is unique",
    );

    const v1 = await prisma.jobSpecificationVersion.findUniqueOrThrow({
      where: { id: manual.jobSpecificationVersionId },
    });
    const v2 = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: posted.id,
        versionNumber: v1.versionNumber + 1,
        status: JobSpecificationVersionStatus.PUBLISHED,
        publishedAt: new Date(),
        title: `${PREFIX} Version Two`,
        roleCategory: v1.roleCategory,
        experienceRange: v1.experienceRange,
        location: v1.location,
        compensationRange: v1.compensationRange,
        targetHireDate: v1.targetHireDate,
        numberOfPositions: v1.numberOfPositions,
        mustHaveRequirements: v1.mustHaveRequirements,
        niceToHaveRequirements: v1.niceToHaveRequirements,
        jobDescription: v1.jobDescription,
        evaluationCriteria: v1.evaluationCriteria,
        primarySkills: v1.primarySkills,
        structuredPayload: { schemaVersion: 1, legacy: true },
      },
    });
    await prisma.job.update({
      where: { id: posted.id },
      data: { currentPublishedSpecificationVersionId: v2.id },
    });
    const stillPinned = await prisma.jobDistribution.findUniqueOrThrow({
      where: { id: manual.id },
      select: { jobSpecificationVersionId: true },
    });
    assert(
      stillPinned.jobSpecificationVersionId === v1.id,
      "K: later published spec does not move the pin",
    );

    await assertThrows(
      () =>
        tryMutatePublishedSpecification({
          versionId: v1.id,
          title: "mutated",
        }),
      "Published specifications cannot be changed.",
      "L: published version remains immutable",
    );

    const payload = buildPublicDistributionPayload({
      version: v1,
      applyMode: ApplyMode.EXTERNAL_URL,
      applyUrlSnapshot: manual.applyUrlSnapshot,
      includeCompensation: false,
      companyDisplayName: qa.companyAlpha.name,
    });
    assert(assertPayloadHasNoInternalFields(payload), "public payload has no internal keys");
    assert(payload.compensationRange === null, "compensation omitted without opt-in");
    assert(payload.jobDescription !== null, "canonical JD is public");
    assert(
      !JSON.stringify(payload).includes("evaluation"),
      "evaluationCriteria not in serialized payload",
    );
    assert(
      !JSON.stringify(payload).toLowerCase().includes("aiProposed".toLowerCase()) &&
        !("aiProposedJobDescription" in payload),
      "AI proposal not in payload",
    );

    const withComp = buildPublicDistributionPayload({
      version: v1,
      applyMode: ApplyMode.EXTERNAL_URL,
      applyUrlSnapshot: null,
      includeCompensation: true,
      companyDisplayName: null,
    });
    assert(
      withComp.compensationRange === v1.compensationRange,
      "compensation only when opted in",
    );

    const listed = await listProviderConnectionsForCompany(qa.companyAlpha.id);
    const linkedinConn = listed.find((row) => row.provider === "LINKEDIN");
    assert(linkedinConn?.hasCredential === true, "N: hasCredential flag only");
    const serialized = JSON.stringify(listed);
    assertNotIncludes(serialized, "credentialCiphertext", "N: ciphertext not in DTO");
    assertNotIncludes(serialized, "test-credential-not-for-live-use", "N: plaintext not in DTO");
    const dbConn = await prisma.providerConnection.findFirstOrThrow({
      where: {
        companyId: qa.companyAlpha.id,
        provider: "LINKEDIN",
      },
    });
    assert(dbConn.credentialCiphertext, "ciphertext stored");
    assert(
      dbConn.credentialCiphertext !== "test-credential-not-for-live-use",
      "N: secret is encrypted at rest",
    );
    assert(
      encryptCredentialSecret("round-trip-check").startsWith("v1."),
      "encryption helper uses v1 AES-GCM envelope",
    );

    const afterLifecycle = await prisma.job.findUniqueOrThrow({
      where: { id: posted.id },
      select: {
        requirementLifecycle: true,
        sourcingDatabaseSource: true,
        sourcingAccessDetails: true,
        sourcingAccessReceivedAt: true,
        shortlistingDueAt: true,
        shortlistingCompletedAt: true,
      },
    });
    assert(
      afterLifecycle.requirementLifecycle === beforeLifecycle,
      "V: requirement lifecycle unchanged",
    );
    assert(
      afterLifecycle.sourcingDatabaseSource === "LINKEDIN",
      "O: T69 source database unchanged",
    );
    assert(afterLifecycle.sourcingAccessReceivedAt === null, "O: T69 access timestamp untouched");
    assert(afterLifecycle.shortlistingDueAt === null, "O: T69 SLA untouched");
    assert(afterLifecycle.shortlistingCompletedAt === null, "O: T70 timestamp untouched");

    assert(canTransitionDistribution("READY", "PUBLISHING"), "U: READY→PUBLISHING allowed");
    await assertThrows(
      () => assertDistributionTransition("READY", "PUBLISHED"),
      "Invalid distribution status transition.",
      "U: READY→PUBLISHED skipped PUBLISHING",
    );
    await assertThrows(
      () => assertDistributionTransition("CLOSED", "READY"),
      "Invalid distribution status transition.",
      "U: CLOSED is terminal",
    );

    const paused = await pauseJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      distributionId: manual.id,
    });
    assert(paused.status === "PAUSED", "Manual pause succeeds locally");
    const closed = await closeJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      distributionId: manual.id,
    });
    assert(closed.status === "CLOSED", "Manual close succeeds locally");

    const reopened = await createJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      jobId: posted.id,
      provider: "MANUAL",
      applyMode: "EXTERNAL_URL",
      applyUrl: "https://careers.example.com/apply/v2",
    });
    assert(
      reopened.jobSpecificationVersionId === v2.id,
      "new distribution after close pins the current published version",
    );

    await assertThrows(
      () =>
        createJobDistributionForCompany({
          companyId: qa.companyAlpha.id,
          jobId: posted.id,
          provider: "NAUKRI",
          applyMode: "PROVIDER_NATIVE",
        }),
      CONNECTION_REQUIRED,
      "unavailable providers require an ACTIVE connection",
    );

    const member = await prisma.user.create({
      data: {
        email: `${PREFIX.toLowerCase()}@example.com`,
        name: `${PREFIX} Member`,
        role: "CLIENT",
        passwordHash: await hashPassword("V1QaPass123!"),
        companyId: qa.companyAlpha.id,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.organizationMember.create({
      data: {
        companyId: qa.companyAlpha.id,
        userId: member.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
    const hydrated = await hydrateAuthUser({
      id: member.id,
      email: member.email,
      name: member.name,
      role: member.role,
      companyId: member.companyId,
      interviewerId: null,
      emailVerifiedAt: member.emailVerifiedAt,
    });
    const portal = await authorizeClientPortalAccess(hydrated);
    assert(portal.membershipRole === "MEMBER", "MEMBER hydrates from membership");
    await closeJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      distributionId: reopened.id,
    });
    const memberCreate = await createJobDistributionForCompany({
      companyId: portal.companyId,
      jobId: posted.id,
      provider: "MANUAL",
      applyMode: "EXTERNAL_URL",
      applyUrl: "https://careers.example.com/apply/member",
    });
    assert(memberCreate.companyId === qa.companyAlpha.id, "MEMBER uses membership companyId");

    const previousUnset = process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY;
    assert(!isCredentialEncryptionConfigured(), "missing key is detected");
    await assertThrows(
      () =>
        upsertProviderConnectionForCompany({
          companyId: qa.companyAlpha.id,
          provider: "NAUKRI",
          providerAccountId: `${PREFIX}-naukri`,
          credential: "secret",
        }),
      "Credential encryption is not configured.",
      "missing encryption key fails safely",
    );
    process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY = previousUnset;

    const sourcingClient = source("components/sourcing/SourcingClient.tsx");
    assertIncludes(
      sourcingClient,
      "SOURCING_SHORTLISTING",
      "O: /dashboard/sourcing remains T69",
    );
    assertNotIncludes(
      sourcingClient,
      "createJobDistribution",
      "O: sourcing UI has no T83 distribution",
    );
    assertNotIncludes(
      source("components/jobs/JobForm.tsx"),
      "JobDistribution",
      "O: Admin job form is still T69 source database",
    );
    assertIncludes(
      source("lib/jobs/sourcing-access-handoff.ts"),
      "recordSourcingAccessHandoff",
      "O: T69 handoff file unchanged in purpose",
    );
    assert(
      !distService.includes("sourcingDatabaseSource"),
      "O: distribution service does not read T69 source database",
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.HIREIQ_CREDENTIAL_ENCRYPTION_KEY = previousKey;
    }
    const users = await prisma.user.findMany({
      where: { email: { startsWith: PREFIX.toLowerCase() } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    if (userIds.length) {
      await prisma.organizationMember.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await cleanupW24();
  }
}
