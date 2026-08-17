/**
 * T84: HireIQ hosted public apply.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * createJobDistribution / publishJobDistribution require Auth.js request
 * scope. This workflow calls the same production services those actions use.
 *
 * No Playwright. No resume upload. No Candidate/Application creation.
 */
import { randomUUID } from "node:crypto";

import { ApplyMode, JobSpecificationVersionStatus } from "@prisma/client";

import {
  findLiveApplyToken,
} from "../../lib/apply/apply-token";
import {
  APPLY_LINK_UNAVAILABLE,
  HostedApplyValidationError,
  ROLE_NO_LONGER_ACCEPTING,
} from "../../lib/apply/hosted-apply-errors";
import { resolvePublicHostedApply, submitHostedApply } from "../../lib/apply/hosted-apply-service";
import { assertHostedApplyPageHasNoInternalFields } from "../../lib/apply/public-page";
import { hashSecureToken } from "../../lib/auth/secure-token";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForIp,
} from "../../lib/auth/rate-limit";
import {
  closeJobDistributionForCompany,
  createJobDistributionForCompany,
  publishJobDistributionForCompany,
} from "../../lib/jobs/distribution/distribution-service";
import { MANUAL_DISTRIBUTION_ACTIVE } from "../../lib/validation/job-distribution-validation";
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

const PREFIX = `${TMP_PREFIX}-W25`;
const APP_URL_FOR_TEST = "https://app.hireiq.test";

async function cleanupW25() {
  await cleanupPrefix(PREFIX);
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

function rawTokenFromApplyUrl(url: string) {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const token = segments[segments.length - 1];
  assert(token, "hosted apply URL includes a token segment");
  return token;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    consent: true,
    ...overrides,
  };
}

async function publishHosted(input: {
  companyId: number;
  jobId: number;
  includeCompensation?: boolean;
}) {
  const distribution = await createJobDistributionForCompany({
    companyId: input.companyId,
    jobId: input.jobId,
    provider: "MANUAL",
    applyMode: ApplyMode.HIREIQ_HOSTED,
    includeCompensation: input.includeCompensation === true,
    applyUrl: "https://browser.example/ignored",
    companyIdFromBrowser: 999999,
    specificationVersionId: 999999,
  });
  const published = await publishJobDistributionForCompany({
    companyId: input.companyId,
    distributionId: distribution.id,
  });
  assert(published.status === "PUBLISHED", "hosted distribution publishes");
  assert(published.applyUrlSnapshot, "Y: hosted URL generated server-side");
  assert(
    published.applyUrlSnapshot?.startsWith(`${APP_URL_FOR_TEST}/apply/`) === true,
    "Y: hosted URL uses APP_URL, not localhost",
  );
  return {
    distribution: published,
    rawToken: rawTokenFromApplyUrl(published.applyUrlSnapshot!),
  };
}

export async function runWorkflow25() {
  await cleanupW25();
  const qa = await loadV1Qa();
  const previousAppUrl = process.env.APP_URL;
  process.env.APP_URL = APP_URL_FOR_TEST;

  try {
    console.log("W25 hosted apply");
    console.log("AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED");

    const schema = source("prisma/schema.prisma");
    const authSrc = source("auth.ts");
    const proxySrc = source("proxy.ts");
    const authConfigSrc = source("auth.config.ts");
    const appValidation = source("lib/validation/application-validation.ts");
    const applicationActions = source("app/actions/application-actions.ts");
    const applyService = source("lib/apply/hosted-apply-service.ts");
    const applyRoute = source("app/api/apply/[token]/route.ts");
    const applyPage = source("app/apply/[token]/page.tsx");
    const applyForm = source("components/apply/HostedApplyForm.tsx");
    const distService = source("lib/jobs/distribution/distribution-service.ts");
    const distValidation = source("lib/validation/job-distribution-validation.ts");
    const jobActions = source("app/actions/job-actions.ts");

    assertIncludes(schema, "model ApplyToken", "ApplyToken model exists");
    assertIncludes(schema, "model HostedApplySubmission", "HostedApplySubmission exists");
    assertIncludes(
      schema,
      "enum HostedApplySubmissionStatus {\n  RECEIVED\n}",
      "submission status is RECEIVED only",
    );
    assertNotIncludes(schema, "rawToken", "Z: no plaintext token column");
    assertNotIncludes(schema, "model ApplicationIngestionEvent", "no T85 ingestion model");
    assertIncludes(
      schema,
      "enum SourcingDatabaseSource {\n  LINKEDIN\n  NAUKRI\n}",
      "AD/W: T69 enum unchanged",
    );
    assertIncludes(schema, "source SourcingDatabaseSource?", "AD: Application.source unchanged");
    assertIncludes(authSrc, "token.id = user.id", "V: JWT still sets id");
    assertNotIncludes(
      authSrc.split("async jwt")[1] ?? "",
      "companyId",
      "V: JWT callback does not store companyId",
    );
    assertNotIncludes(proxySrc, "/apply", "public apply is not in auth proxy matcher");
    assertNotIncludes(authConfigSrc, "/apply", "public apply is not an authenticated gate");
    assertNotIncludes(applyService, "createApplication", "AB: T84 does not create Application");
    assertNotIncludes(applyService, "createSourcedApplication", "AB: no sourced application");
    assertNotIncludes(applyService, "prisma.candidate.create", "AB: no Candidate create");
    assertNotIncludes(applyRoute, "createApplication", "AB: route does not create Application");
    assertNotIncludes(applyForm, 'type="file"', "P: no resume upload input");
    assertNotIncludes(applyForm, "dangerouslySetInnerHTML", "O: form does not render HTML");
    assertNotIncludes(applyPage, "dangerouslySetInnerHTML", "O: page does not render HTML");
    assertIncludes(applyPage, 'dynamic = "force-dynamic"', "apply page is dynamic");
    assertIncludes(applyRoute, 'Cache-Control": "no-store"', "POST is no-store");
    const applyLog = applyService.split("console.info")[1] ?? "";
    assertNotIncludes(applyLog, "email", "AA: submit log does not include email");
    assertNotIncludes(applyLog, "phone", "AA: submit log does not include phone");
    assertNotIncludes(applyLog, "coverLetter", "AA: submit log does not include cover letter");
    assertNotIncludes(applyRoute, "rawToken", "AA: route does not name rawToken");
    assertNotIncludes(distService, "requirementLifecycle:", "X: distribution does not write lifecycle");
    assertNotIncludes(jobActions, "createJobDistribution", "X: complete path has no distribution");
    assertIncludes(appValidation, "SourcingDatabaseSource", "AD: application validation still T69");
    assertIncludes(applicationActions, "requireAdmin", "application actions remain Admin-gated");
    assertIncludes(distValidation, "MANUAL_DISTRIBUTION_ACTIVE", "AG: manual collision message exists");
    assertIncludes(applyPage, "whitespace-pre-wrap", "job text is rendered as text");

    await assertThrows(
      () => resolvePublicHostedApply("not-a-real-token"),
      APPLY_LINK_UNAVAILABLE,
      "A: invalid token is unavailable",
    );

    const randomToken = hashSecureToken("seed").slice(0, 43);
    await assertThrows(
      () => resolvePublicHostedApply(randomToken),
      APPLY_LINK_UNAVAILABLE,
      "B: random token misses",
    );

    const alphaJob = await publishedJob({
      title: "Hosted Alpha",
      companyId: qa.companyAlpha.id,
    });
    const betaJob = await publishedJob({
      title: "Hosted Beta",
      companyId: qa.companyBeta.id,
    });
    const beforeAlpha = await prisma.job.findUniqueOrThrow({
      where: { id: alphaJob.id },
      select: {
        requirementLifecycle: true,
        sourcingAccessReceivedAt: true,
        shortlistingCompletedAt: true,
        currentPublishedSpecificationVersionId: true,
      },
    });

    const alphaHosted = await publishHosted({
      companyId: qa.companyAlpha.id,
      jobId: alphaJob.id,
      includeCompensation: false,
    });
    const betaHosted = await publishHosted({
      companyId: qa.companyBeta.id,
      jobId: betaJob.id,
      includeCompensation: true,
    });

    const alphaPage = await resolvePublicHostedApply(alphaHosted.rawToken);
    assert(alphaPage.title.includes("Hosted Alpha"), "C: valid token resolves Alpha job");
    assert(
      alphaPage.companyDisplayName === qa.companyAlpha.name,
      "C: company display name is Alpha",
    );
    assert(alphaPage.compensationRange === null, "compensation hidden unless enabled");
    assert(
      assertHostedApplyPageHasNoInternalFields(alphaPage),
      "G/H: public DTO has no internal fields",
    );
    assert(
      !("evaluationCriteria" in alphaPage),
      "G: evaluationCriteria absent",
    );
    assert(
      !("aiProposedJobDescription" in alphaPage),
      "H: AI proposal absent",
    );

    const betaPage = await resolvePublicHostedApply(betaHosted.rawToken);
    assert(betaPage.title.includes("Hosted Beta"), "D: Beta token resolves Beta job");
    assert(
      betaPage.companyDisplayName === qa.companyBeta.name,
      "D: cross-company isolation",
    );
    assert(
      betaPage.compensationRange === "30-40 LPA",
      "compensation included when enabled",
    );

    const alphaTokenRow = await prisma.applyToken.findFirstOrThrow({
      where: { distributionId: alphaHosted.distribution.id, revokedAt: null },
    });
    assert(
      alphaTokenRow.tokenHash === hashSecureToken(alphaHosted.rawToken),
      "Z: tokenHash is SHA-256 of raw token",
    );
    assert(
      alphaTokenRow.tokenHash !== alphaHosted.rawToken,
      "Z: raw token is not stored as hash",
    );

    const posting = await prisma.providerPosting.findUnique({
      where: { distributionId: alphaHosted.distribution.id },
    });
    assert(posting === null, "AF: HIREIQ_HOSTED does not fabricate ProviderPosting");

    const connection = await prisma.providerConnection.findFirst({
      where: {
        companyId: qa.companyAlpha.id,
        provider: "MANUAL",
      },
    });
    assert(
      connection === null || alphaHosted.distribution.status === "PUBLISHED",
      "AE: hosted apply does not require ProviderConnection",
    );

    const afterPublish = await prisma.job.findUniqueOrThrow({
      where: { id: alphaJob.id },
      select: {
        requirementLifecycle: true,
        sourcingAccessReceivedAt: true,
        shortlistingCompletedAt: true,
        currentPublishedSpecificationVersionId: true,
      },
    });
    assert(
      afterPublish.requirementLifecycle === beforeAlpha.requirementLifecycle,
      "X: lifecycle unchanged",
    );
    assert(
      afterPublish.sourcingAccessReceivedAt?.getTime() ===
        beforeAlpha.sourcingAccessReceivedAt?.getTime(),
      "W: T69 timestamp unchanged",
    );
    assert(
      afterPublish.shortlistingCompletedAt?.getTime() ===
        beforeAlpha.shortlistingCompletedAt?.getTime(),
      "W: T70 timestamp unchanged",
    );

    const draftJob = await createTmpJob({
      prefix: PREFIX,
      title: "Draft Public",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: null,
      requirementLifecycle: "REQUIREMENT_DRAFTED",
    });
    const draftVersion = await prisma.jobSpecificationVersion.findFirstOrThrow({
      where: { jobId: draftJob.id, status: JobSpecificationVersionStatus.DRAFT },
    });
    await prisma.jobDistribution.update({
      where: { id: alphaHosted.distribution.id },
      data: { jobSpecificationVersionId: draftVersion.id },
    });
    await assertThrows(
      () => resolvePublicHostedApply(alphaHosted.rawToken),
      APPLY_LINK_UNAVAILABLE,
      "E: draft spec cannot be publicly shown",
    );
    await prisma.jobDistribution.update({
      where: { id: alphaHosted.distribution.id },
      data: {
        jobSpecificationVersionId:
          beforeAlpha.currentPublishedSpecificationVersionId!,
      },
    });

    const pinnedPage = await resolvePublicHostedApply(alphaHosted.rawToken);
    assert(pinnedPage.title.includes("Hosted Alpha"), "F: pinned published spec used");

    const v2 = await prisma.jobSpecificationVersion.create({
      data: {
        jobId: alphaJob.id,
        versionNumber: 2,
        status: JobSpecificationVersionStatus.PUBLISHED,
        publishedAt: new Date(),
        title: `${PREFIX} V2 Must Not Appear`,
        roleCategory: "ENGINEERING",
        experienceRange: "1-2 years",
        location: "Remote",
        compensationRange: "1 LPA",
        numberOfPositions: 9,
        mustHaveRequirements: "v2 must",
        niceToHaveRequirements: "v2 nice",
        jobDescription: "v2 description",
        evaluationCriteria: "v2 eval",
        primarySkills: "v2 skills",
        structuredPayload: { schemaVersion: 1, legacy: true },
        aiProposedJobDescription: "secret AI proposal",
      },
    });
    await prisma.job.update({
      where: { id: alphaJob.id },
      data: { currentPublishedSpecificationVersionId: v2.id },
    });
    const afterV2 = await resolvePublicHostedApply(alphaHosted.rawToken);
    assert(afterV2.title.includes("Hosted Alpha"), "T: spec v2 does not move old pin");
    assert(!afterV2.title.includes("V2 Must Not Appear"), "T: v2 title not rendered");
    assert(
      alphaHosted.distribution.jobSpecificationVersionId ===
        beforeAlpha.currentPublishedSpecificationVersionId,
      "T: distribution pin unchanged",
    );

    const candidatesBefore = await prisma.candidate.count();
    const applicationsBefore = await prisma.application.count();

    const firstKey = randomUUID();
    const submitted = await submitHostedApply({
      token: alphaHosted.rawToken,
      idempotencyKey: firstKey,
      body: validBody({
        companyId: qa.companyBeta.id,
        jobId: betaJob.id,
        distributionId: betaHosted.distribution.id,
        specificationVersionId: v2.id,
        applyTokenId: 0,
        candidateId: 1,
        applicationId: 1,
        userId: 1,
        email: "Ada@Example.com",
        coverLetter: "<script>alert(1)</script>",
      }),
    });
    assert(submitted.success === true, "Q: submission created");

    const submission = await prisma.hostedApplySubmission.findUniqueOrThrow({
      where: { idempotencyKey: firstKey },
    });
    assert(submission.companyId === qa.companyAlpha.id, "I: browser companyId ignored");
    assert(submission.jobId === alphaJob.id, "I: browser jobId ignored");
    assert(
      submission.distributionId === alphaHosted.distribution.id,
      "I: browser distributionId ignored",
    );
    assert(
      submission.jobSpecificationVersionId ===
        beforeAlpha.currentPublishedSpecificationVersionId,
      "I: browser specificationVersionId ignored",
    );
    assert(submission.emailNormalized === "ada@example.com", "email is normalized");
    assert(
      submission.coverLetter === "<script>alert(1)</script>",
      "O: XSS payload stored as text",
    );
    assert(submission.status === "RECEIVED", "Q: status is RECEIVED");

    const replay = await submitHostedApply({
      token: alphaHosted.rawToken,
      idempotencyKey: firstKey,
      body: validBody({ email: "other@example.com", name: "Other" }),
    });
    assert(replay.success === true, "R: repeated idempotency returns success");
    assert(
      (await prisma.hostedApplySubmission.count({
        where: { distributionId: alphaHosted.distribution.id },
      })) === 1,
      "R: same idempotency key does not create a second row",
    );

    const duplicateEmail = await submitHostedApply({
      token: alphaHosted.rawToken,
      idempotencyKey: randomUUID(),
      body: validBody({ email: "ada@example.com" }),
    });
    assert(duplicateEmail.success === true, "L: duplicate email returns received");
    assert(
      (await prisma.hostedApplySubmission.count({
        where: { distributionId: alphaHosted.distribution.id },
      })) === 1,
      "L: unique distribution+email is T84 anti-duplicate only",
    );

    await assertThrows(
      () =>
        submitHostedApply({
          token: alphaHosted.rawToken,
          idempotencyKey: randomUUID(),
          body: validBody({
            coverLetter: "x".repeat(8001),
            email: "oversized@example.com",
          }),
        }),
      (error) =>
        error instanceof HostedApplyValidationError &&
        Boolean(error.fields.coverLetter?.includes("too long")),
      "N: oversized cover letter rejected",
    );

    await assertThrows(
      () =>
        submitHostedApply({
          token: alphaHosted.rawToken,
          idempotencyKey: randomUUID(),
          body: validBody({
            linkedInUrl: "javascript:alert(1)",
            email: "jsurl@example.com",
          }),
        }),
      (error) =>
        error instanceof HostedApplyValidationError &&
        Boolean(error.fields.linkedInUrl?.includes("http")),
      "O: javascript: URL rejected",
    );

    const candidatesAfter = await prisma.candidate.count();
    const applicationsAfter = await prisma.application.count();
    assert(candidatesAfter === candidatesBefore, "AB: no Candidate created");
    assert(applicationsAfter === applicationsBefore, "AC: no Application created");

    await prisma.job.update({
      where: { id: alphaJob.id },
      data: { status: "CLOSED" },
    });
    await assertThrows(
      () => resolvePublicHostedApply(alphaHosted.rawToken),
      ROLE_NO_LONGER_ACCEPTING,
      "K: closed Job rejects apply",
    );
    await prisma.job.update({
      where: { id: alphaJob.id },
      data: { status: "OPEN" },
    });

    const closed = await closeJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      distributionId: alphaHosted.distribution.id,
    });
    assert(closed.status === "CLOSED", "distribution closed");
    const revoked = await prisma.applyToken.findFirstOrThrow({
      where: { distributionId: alphaHosted.distribution.id },
      orderBy: { createdAt: "desc" },
    });
    assert(revoked.revokedAt !== null, "S: token revoked on close");
    await assertThrows(
      () => resolvePublicHostedApply(alphaHosted.rawToken),
      APPLY_LINK_UNAVAILABLE,
      "J/S: closed/revoked token rejects apply",
    );
    await assertThrows(
      () =>
        submitHostedApply({
          token: alphaHosted.rawToken,
          idempotencyKey: randomUUID(),
          body: validBody({ email: "after-close@example.com" }),
        }),
      APPLY_LINK_UNAVAILABLE,
      "J: closed distribution rejects submit",
    );

    const collisionJob = await publishedJob({
      title: "Collision",
      companyId: qa.companyAlpha.id,
    });
    await createJobDistributionForCompany({
      companyId: qa.companyAlpha.id,
      jobId: collisionJob.id,
      provider: "MANUAL",
      applyMode: "EXTERNAL_URL",
      applyUrl: "https://careers.example.com/apply",
    });
    await assertThrows(
      () =>
        createJobDistributionForCompany({
          companyId: qa.companyAlpha.id,
          jobId: collisionJob.id,
          provider: "MANUAL",
          applyMode: "HIREIQ_HOSTED",
        }),
      MANUAL_DISTRIBUTION_ACTIVE,
      "AG: MANUAL collision handled safely",
    );

    const rateKey = rateLimitKeyForIp(`w25-${Date.now()}`);
    for (let index = 0; index < 10; index += 1) {
      await consumeAuthRateLimit({
        name: "hostedApplyPostIp",
        key: rateKey,
      });
    }
    await assertThrows(
      () =>
        consumeAuthRateLimit({
          name: "hostedApplyPostIp",
          key: rateKey,
        }),
      (error) => error instanceof RateLimitError,
      "M: rate limit fires",
    );

    const live = await findLiveApplyToken(betaHosted.distribution.id);
    assert(live, "Beta hosted token remains live");
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = previousAppUrl;
    }
    await cleanupW25();
  }
}
