/**
 * T81: JobSpecificationVersion dual-read / dual-write.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * createJob / updateJob / updateClientRequirement / completeJobRequirement
 * require Auth.js request scope.
 *
 * This workflow tests the production specification service, completion
 * validation, Prisma constraints, dual-read helper, and source scans
 * those actions call. It is not a Playwright browser suite and does
 * not fake Auth.js.
 */
import { JobSpecificationVersionStatus, Prisma } from "@prisma/client";

import { jobScopeWhere } from "../../lib/auth/authorization";
import {
  createDraftSpecificationForJob,
  hasMeaningfulSpecification,
  isPostedOrLater,
  publishDraftSpecification,
  readJobSpecification,
  specFieldsFromRecord,
  tryMutatePublishedSpecification,
  upsertDraftSpecification,
} from "../../lib/jobs/job-specification";
import { createClientRequirementDraftForCompany } from "../../lib/organizations/client-requirement-draft";
import {
  SPECIFICATION_PUBLISHED_IMMUTABLE_ERROR,
  SPECIFICATION_STALE_ERROR,
  validateJobRequirementCompletion,
} from "../../lib/validation/job-specification-validation";
import { validateJobInput } from "../../lib/validation/job-validation";
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

const PREFIX = `${TMP_PREFIX}-W21`;

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

function scalarEqual(
  left: ReturnType<typeof specFieldsFromRecord>,
  right: ReturnType<typeof specFieldsFromRecord>,
) {
  return (
    left.title === right.title &&
    left.roleCategory === right.roleCategory &&
    left.experienceRange === right.experienceRange &&
    left.location === right.location &&
    left.compensationRange === right.compensationRange &&
    left.numberOfPositions === right.numberOfPositions &&
    left.mustHaveRequirements === right.mustHaveRequirements &&
    left.niceToHaveRequirements === right.niceToHaveRequirements &&
    left.jobDescription === right.jobDescription &&
    left.evaluationCriteria === right.evaluationCriteria &&
    left.primarySkills === right.primarySkills &&
    (left.targetHireDate?.getTime() ?? null) ===
      (right.targetHireDate?.getTime() ?? null)
  );
}

export async function runWorkflow21() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W21 job specification versioning");

    const jobActions = source("app/actions/job-actions.ts");
    const specService = source("lib/jobs/job-specification.ts");
    const specValidation = source(
      "lib/validation/job-specification-validation.ts",
    );
    const jobValidation = source("lib/validation/job-validation.ts");
    const authJsSource = source("auth.ts");
    const migrationSql = source(
      "prisma/migrations/20260817160000_job_specification_version/migration.sql",
    );
    const draftService = source(
      "lib/organizations/client-requirement-draft.ts",
    );
    const interviewerRepo = source(
      "lib/repositories/interviewer-portal-repository.ts",
    );
    const jobRepo = source("lib/repositories/job-repository.ts");
    const clientWorkspace = source(
      "components/client/ClientRequirementWorkspace.tsx",
    );

    assertIncludes(
      jobActions,
      "createDraftSpecificationForJob",
      "F: Admin createJob dual-writes a DRAFT specification",
    );
    assertIncludes(
      jobActions,
      "upsertDraftSpecification",
      "F: Admin/Client updates write through the specification service",
    );
    assertIncludes(
      jobActions,
      "publishDraftSpecification",
      "J: completion publishes through the specification service",
    );
    assertIncludes(
      jobActions,
      'requirementLifecycle: "CLIENT_NOTIFIED"',
      "I: completion updateMany still requires CLIENT_NOTIFIED",
    );
    assertIncludes(
      jobActions,
      'requirementLifecycle: "REQUIREMENT_POSTED"',
      "I: completion still posts to REQUIREMENT_POSTED",
    );
    assertIncludes(
      jobActions,
      "clientCompletedAt: new Date()",
      "I: completion still plants clientCompletedAt",
    );
    assertIncludes(
      jobActions,
      'existingJob.requirementLifecycle !== "REQUIREMENT_DRAFTED"',
      "G: Client may edit REQUIREMENT_DRAFTED specifications",
    );
    assertIncludes(
      jobActions,
      'existingJob.requirementLifecycle !== "CLIENT_NOTIFIED"',
      "H: Client may edit CLIENT_NOTIFIED specifications",
    );
    assertIncludes(
      jobActions,
      "requireOptimisticLock: true",
      "L: Client draft save uses optimistic locking",
    );
    assertIncludes(
      jobActions,
      "companyId: client.companyId",
      "P: Client writes scope Jobs by membership companyId",
    );
    assertIncludes(
      jobActions,
      "const client = await requireClientPortal()",
      "P: Client specification ops use requireClientPortal",
    );
    assertNotIncludes(
      jobActions,
      "fields.companyId",
      "P: Client requirement fields do not accept browser companyId",
    );
    assertNotIncludes(
      jobActions,
      "specificationVersionId",
      "P: specificationVersionId is not an authorization key",
    );
    assertIncludes(
      draftService,
      "createDraftSpecificationForJob",
      "D: T80 title-only drafts create a DRAFT specification",
    );
    assertIncludes(
      specValidation,
      "Role category is required.",
      "completion completeness still lives in specification validation",
    );
    assertIncludes(
      jobValidation,
      "assertGenericJobInputRejectsWorkflowTimestamps",
      "O: generic Job input still rejects workflow timestamps",
    );
    assertNotIncludes(
      specValidation,
      "requirementLifecycle",
      "lifecycle semantics stay out of JobSpecification validation",
    );
    assertIncludes(
      specService,
      "status: JobSpecificationVersionStatus.DRAFT",
      "production specification writes target DRAFT",
    );
    assertIncludes(
      jobRepo,
      "readEditableJobSpecification",
      "Client/Admin detail reads specification through the helper",
    );
    assertIncludes(
      interviewerRepo,
      "readJobSpecification",
      "N: Interviewer reads published specification through the helper",
    );
    assertNotIncludes(
      interviewerRepo,
      "readEditableJobSpecification",
      "N: Interviewer does not overlay unpublished DRAFT",
    );
    assertIncludes(
      clientWorkspace,
      'requirement.requirementLifecycle === "REQUIREMENT_DRAFTED"',
      "G: Client UI allows DRAFTED editing",
    );
    assertIncludes(
      clientWorkspace,
      'requirement.requirementLifecycle === "CLIENT_NOTIFIED"',
      "H: Client UI allows CLIENT_NOTIFIED editing and completion",
    );
    assertNotIncludes(
      authJsSource,
      "token.companyId",
      "Q: JWT does not store companyId",
    );
    assertIncludes(authJsSource, "token.id = user.id", "Q: JWT stores user id");
    assertIncludes(
      authJsSource,
      "token.role = user.role",
      "Q: JWT stores role",
    );
    assertIncludes(
      migrationSql,
      "JobSpecificationVersion_one_draft_per_job",
      "M: one DRAFT per Job is enforced in SQL",
    );
    assertIncludes(
      migrationSql,
      "WHERE NOT EXISTS",
      "migration backfill is idempotent",
    );
    assertNotIncludes(
      migrationSql,
      'SET "requirementLifecycle"',
      "C: migration does not alter requirementLifecycle",
    );
    assertNotIncludes(
      migrationSql,
      '"clientCompletedAt" =',
      "C: migration does not rewrite clientCompletedAt",
    );
    assertNotIncludes(
      migrationSql,
      '"sourcingAccessReceivedAt" =',
      "C: migration does not rewrite sourcing timestamps",
    );
    assertNotIncludes(
      migrationSql,
      '"assignedInterviewerId" =',
      "C: migration does not rewrite assignment",
    );

    const v1qaJobs = await prisma.job.findMany({
      where: { title: { startsWith: "V1QA " } },
      include: {
        currentPublishedSpecificationVersion: true,
        specificationVersions: true,
      },
    });
    assert(v1qaJobs.length > 0, "A: V1QA jobs exist for backfill assertions");

    for (const job of v1qaJobs) {
      const published = job.specificationVersions.filter(
        (version) => version.status === JobSpecificationVersionStatus.PUBLISHED,
      );
      const drafts = job.specificationVersions.filter(
        (version) => version.status === JobSpecificationVersionStatus.DRAFT,
      );

      if (hasMeaningfulSpecification(job) && isPostedOrLater(job.requirementLifecycle)) {
        assert(published.length >= 1, `A: ${job.title} has a PUBLISHED version`);
        assert(
          job.currentPublishedSpecificationVersionId !== null,
          `A: ${job.title} published pointer is set`,
        );
        assert(
          job.currentPublishedSpecificationVersion !== null,
          `A: ${job.title} published relation hydrates`,
        );
        assert(
          scalarEqual(
            specFieldsFromRecord(job),
            specFieldsFromRecord(job.currentPublishedSpecificationVersion!),
          ),
          `B: ${job.title} Job projection equals published specification`,
        );
        assert(
          drafts.length === 0,
          `A: posted V1QA job ${job.title} has no leftover DRAFT`,
        );
      }

      assert(
        job.requirementLifecycle !== "REQUIREMENT_DRAFTED" ||
          job.clientCompletedAt === null,
        "C: DRAFTED jobs were not given clientCompletedAt by versioning",
      );
    }

    const titleOnly = await createClientRequirementDraftForCompany({
      companyId: qa.companyAlpha.id,
      title: `${PREFIX} Empty Draft`,
    });
    const titleOnlyJob = await prisma.job.findUniqueOrThrow({
      where: { id: titleOnly.id },
      include: { specificationVersions: true },
    });
    assert(
      titleOnlyJob.requirementLifecycle === "REQUIREMENT_DRAFTED",
      "D: T80 draft stays REQUIREMENT_DRAFTED",
    );
    assert(
      titleOnlyJob.currentPublishedSpecificationVersionId === null,
      "D: empty draft has no published pointer",
    );
    assert(
      titleOnlyJob.specificationVersions.length === 1,
      "D: empty draft has exactly one specification version",
    );
    assert(
      titleOnlyJob.specificationVersions[0]?.status ===
        JobSpecificationVersionStatus.DRAFT,
      "D: empty draft version is DRAFT, not PUBLISHED",
    );
    assert(
      titleOnlyJob.clientCompletedAt === null,
      "D: empty draft does not plant clientCompletedAt",
    );
    assert(
      !hasMeaningfulSpecification(titleOnlyJob),
      "D: title-only job is classified as empty spec",
    );

    const drafted = await createTmpJob({
      prefix: PREFIX,
      title: "Draft Edit",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: null,
      requirementLifecycle: "REQUIREMENT_DRAFTED",
    });
    const notified = await createTmpJob({
      prefix: PREFIX,
      title: "Notified Edit",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: null,
      requirementLifecycle: "CLIENT_NOTIFIED",
    });
    const posted = await createTmpJob({
      prefix: PREFIX,
      title: "Posted Lock",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "REQUIREMENT_POSTED",
    });

    const draftEdit = await upsertDraftSpecification({
      jobId: drafted.id,
      lifecycle: "REQUIREMENT_DRAFTED",
      fields: completeSpec(`${PREFIX} Draft Edited`),
      createdByUserId: qa.clientAlpha.id,
    });
    const draftedJob = await prisma.job.findUniqueOrThrow({
      where: { id: drafted.id },
    });
    assert(
      draftedJob.title === `${PREFIX} Draft Edited`,
      "G: DRAFTED dual-write updates Job compatibility title",
    );
    assert(
      draftedJob.requirementLifecycle === "REQUIREMENT_DRAFTED",
      "G: DRAFTED edit does not change lifecycle",
    );
    assert(
      draftEdit.status === JobSpecificationVersionStatus.DRAFT,
      "G: DRAFTED edit writes the DRAFT version",
    );

    const notifiedEdit = await upsertDraftSpecification({
      jobId: notified.id,
      lifecycle: "CLIENT_NOTIFIED",
      fields: completeSpec(`${PREFIX} Notified Edited`),
      createdByUserId: qa.clientAlpha.id,
    });
    const notifiedJob = await prisma.job.findUniqueOrThrow({
      where: { id: notified.id },
    });
    assert(
      notifiedJob.requirementLifecycle === "CLIENT_NOTIFIED",
      "H: CLIENT_NOTIFIED edit does not change lifecycle",
    );
    assert(
      notifiedEdit.status === JobSpecificationVersionStatus.DRAFT,
      "H: CLIENT_NOTIFIED edit writes the DRAFT version",
    );

    await assertThrows(
      () =>
        upsertDraftSpecification({
          jobId: posted.id,
          lifecycle: "REQUIREMENT_POSTED",
          fields: completeSpec(`${PREFIX} Illegal Posted Edit`),
        }),
      "Specification cannot be edited after the requirement is posted.",
      "K: specification mutation after REQUIREMENT_POSTED is rejected",
    );

    await assertThrows(
      () => validateJobRequirementCompletion(specFieldsFromRecord(titleOnlyJob)),
      "Role category is required.",
      "I: incomplete specification still fails completion validation",
    );

    const completeNotified = await createTmpJob({
      prefix: PREFIX,
      title: "Publish",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: null,
      requirementLifecycle: "CLIENT_NOTIFIED",
    });
    await upsertDraftSpecification({
      jobId: completeNotified.id,
      lifecycle: "CLIENT_NOTIFIED",
      fields: completeSpec(`${PREFIX} Ready To Publish`),
    });

    const published = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "Job" WHERE "id" = ${completeNotified.id} FOR UPDATE
      `;
      const version = await publishDraftSpecification({
        jobId: completeNotified.id,
        createdByUserId: qa.clientAlpha.id,
        db: tx,
      });
      const transition = await tx.job.updateMany({
        where: {
          id: completeNotified.id,
          requirementLifecycle: "CLIENT_NOTIFIED",
        },
        data: {
          clientCompletedAt: new Date(),
          requirementLifecycle: "REQUIREMENT_POSTED",
        },
      });
      assert(transition.count === 1, "J: completion updateMany still wins once");
      return version;
    });

    const afterPublish = await prisma.job.findUniqueOrThrow({
      where: { id: completeNotified.id },
      include: {
        currentPublishedSpecificationVersion: true,
        specificationVersions: true,
      },
    });
    assert(
      afterPublish.requirementLifecycle === "REQUIREMENT_POSTED",
      "J: completion still moves CLIENT_NOTIFIED -> REQUIREMENT_POSTED",
    );
    assert(afterPublish.clientCompletedAt !== null, "J: clientCompletedAt is set");
    assert(
      afterPublish.currentPublishedSpecificationVersionId === published.id,
      "J: Job pointer references the immutable PUBLISHED version",
    );
    assert(
      afterPublish.specificationVersions.every(
        (version) => version.status !== JobSpecificationVersionStatus.DRAFT,
      ),
      "J: DRAFT is removed after publish",
    );
    assert(
      scalarEqual(
        specFieldsFromRecord(afterPublish),
        specFieldsFromRecord(afterPublish.currentPublishedSpecificationVersion!),
      ),
      "J: compatibility Job fields equal the published specification",
    );

    const retryPublished = await prisma.$transaction(async (tx) => {
      return publishDraftSpecification({
        jobId: completeNotified.id,
        db: tx,
      });
    });
    assert(
      retryPublished.id === published.id,
      "J: completion retry does not create a duplicate PUBLISHED version",
    );

    await assertThrows(
      () =>
        tryMutatePublishedSpecification({
          versionId: published.id,
          title: "Mutated published title",
        }),
      SPECIFICATION_PUBLISHED_IMMUTABLE_ERROR,
      "K: published specification mutation is rejected",
    );

    const staleDraft = await prisma.jobSpecificationVersion.findFirstOrThrow({
      where: {
        jobId: drafted.id,
        status: JobSpecificationVersionStatus.DRAFT,
      },
    });
    await assertThrows(
      () =>
        upsertDraftSpecification({
          jobId: drafted.id,
          lifecycle: "REQUIREMENT_DRAFTED",
          fields: completeSpec(`${PREFIX} Stale`),
          expectedUpdatedAt: new Date(staleDraft.updatedAt.getTime() - 1000),
          requireOptimisticLock: true,
        }),
      SPECIFICATION_STALE_ERROR,
      "L: stale DRAFT write is rejected",
    );

    await assertThrows(
      () =>
        prisma.jobSpecificationVersion.create({
          data: {
            jobId: drafted.id,
            versionNumber: 99,
            status: JobSpecificationVersionStatus.DRAFT,
            title: `${PREFIX} Second Draft`,
            structuredPayload: { schemaVersion: 1, legacy: true },
          },
        }),
      (error) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002",
      "M: second DRAFT per Job is rejected by the unique constraint",
    );

    await prisma.job.update({
      where: { id: completeNotified.id },
      data: { title: `${PREFIX} Drifted Job Title` },
    });
    const drifted = await prisma.job.findUniqueOrThrow({
      where: { id: completeNotified.id },
      include: { currentPublishedSpecificationVersion: true },
    });
    const canonical = readJobSpecification(drifted);
    assert(
      canonical.title === `${PREFIX} Ready To Publish`,
      "N: dual-read prefers the published specification over drifted Job columns",
    );
    assert(
      drifted.title === `${PREFIX} Drifted Job Title`,
      "N: Job column drift does not rewrite the published version",
    );

    const betaJob = await createTmpJob({
      prefix: PREFIX,
      title: "Beta Isolation",
      companyId: qa.companyBeta.id,
      assignedInterviewerId: null,
      requirementLifecycle: "CLIENT_NOTIFIED",
    });
    const alphaScoped = await prisma.job.findFirst({
      where: {
        id: betaJob.id,
        companyId: qa.companyAlpha.id,
      },
    });
    assert(alphaScoped === null, "E: Alpha companyId cannot load a Beta Job");
    assert(
      jobScopeWhere(qa.clientAlpha).companyId === qa.companyAlpha.id,
      "E: Client job scope uses membership/company projection, not a browser id",
    );
    assert(
      jobScopeWhere(qa.clientBeta).companyId === qa.companyBeta.id,
      "E: Beta Client job scope stays on Beta",
    );

    const adminCreated = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          status: "OPEN",
          companyId: qa.companyAlpha.id,
          requirementLifecycle: "REQUIREMENT_DRAFTED",
          ...completeSpec(`${PREFIX} Admin Create`),
        },
      });
      await createDraftSpecificationForJob({
        jobId: created.id,
        fields: specFieldsFromRecord(created),
        createdByUserId: qa.admin.id,
        db: tx,
      });
      return created;
    });
    const adminVersions = await prisma.jobSpecificationVersion.findMany({
      where: { jobId: adminCreated.id },
    });
    assert(
      adminVersions.length === 1 &&
        adminVersions[0]?.status === JobSpecificationVersionStatus.DRAFT,
      "F: Admin create dual-writes a DRAFT specification",
    );
    assert(
      scalarEqual(
        specFieldsFromRecord(adminCreated),
        specFieldsFromRecord(adminVersions[0]!),
      ),
      "F: Admin create Job projection equals the DRAFT specification",
    );

    await assertThrows(
      () =>
        validateJobRequirementCompletion({
          ...completeSpec("Missing location"),
          location: null,
        }),
      "Location is required.",
      "completion validation messages remain identical",
    );

    await assertThrows(
      () =>
        validateJobInput(`${PREFIX} Timestamp Plant`, "OPEN", qa.companyAlpha.id, {
          clientCompletedAt: new Date(),
        }),
      "Workflow timestamps must be recorded through the dedicated workflow.",
      "O: generic Job CRUD cannot plant workflow timestamps",
    );

    const runAll = source("scripts/qa/run-all.ts");
    assertIncludes(runAll, "runWorkflow01", "R: W01 remains in the full suite");
    assertIncludes(runAll, "runWorkflow20", "R: W20 remains in the full suite");
    assertIncludes(runAll, "runWorkflow21", "R: W21 is registered in the full suite");

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
