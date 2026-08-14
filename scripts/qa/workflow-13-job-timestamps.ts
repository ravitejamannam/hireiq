/**
 * T72-P1-01 / P1-02: generic Job CRUD cannot plant workflow timestamps.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * createJob / updateJob / completeJobRequirement / markJobSourcingAccessReceived
 * / completeJobShortlisting require Auth.js request scope.
 *
 * This workflow tests the production validator those actions call
 * (validateJobInput), plus the dedicated handoffs, plus source scans.
 */
import { recordSourcingAccessHandoff } from "../../lib/jobs/sourcing-access-handoff";
import { SHORTLISTING_SLA_HOURS } from "../../lib/jobs/sourcing-access-handoff";
import { recordShortlistCompletionHandoff } from "../../lib/jobs/shortlist-completion-handoff";
import {
  JobValidationError,
  validateJobInput,
} from "../../lib/validation/job-validation";
import { assert, assertIncludes, assertNotIncludes, assertThrows } from "./assertions";
import {
  cleanupPrefix,
  createTmpApplication,
  createTmpJob,
  loadV1Qa,
  prisma,
  source,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W13`;
const SLA_MS = SHORTLISTING_SLA_HOURS * 60 * 60 * 1000;
const WORKFLOW_TIMESTAMP_ERROR =
  "Workflow timestamps must be recorded through the dedicated workflow";

export async function runWorkflow13() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  const previousResendKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    console.log("W13 generic job timestamp bypass");

    const jobActions = source("app/actions/job-actions.ts");
    const jobForm = source("components/jobs/JobForm.tsx");
    const jobValidation = source("lib/validation/job-validation.ts");
    const t69Handoff = source("lib/jobs/sourcing-access-handoff.ts");
    const t70Handoff = source("lib/jobs/shortlist-completion-handoff.ts");

    assertIncludes(
      jobActions,
      "requirementFields: GenericJobRequirementInput",
      "createJob/updateJob typed as generic input",
    );
    assertIncludes(
      jobValidation,
      "assertGenericJobInputRejectsWorkflowTimestamps",
      "generic input rejects workflow timestamps",
    );
    assertNotIncludes(
      jobForm,
      "datetime-local",
      "JobForm has no editable datetime-local workflow controls",
    );
    assertIncludes(
      jobActions,
      "clientCompletedAt: new Date()",
      "T67 completeJobRequirement still writes clientCompletedAt",
    );
    assertIncludes(
      t69Handoff,
      "sourcingAccessReceivedAt,",
      "T69 handoff still writes sourcingAccessReceivedAt",
    );
    assertIncludes(
      t69Handoff,
      "shortlistingDueAt,",
      "T69 handoff still writes shortlistingDueAt",
    );
    assertIncludes(
      t70Handoff,
      "shortlistingCompletedAt: new Date()",
      "T70 handoff still writes shortlistingCompletedAt",
    );

    const t69Job = await createTmpJob({
      prefix: PREFIX,
      title: "T69 Timestamp Bypass",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "INTERVIEWER_NOTIFIED",
    });

    const plantedAccessAt = new Date();
    const plantedDueAt = new Date(plantedAccessAt.getTime() + SLA_MS);

    await assertThrows(
      () =>
        validateJobInput(
          t69Job.title,
          t69Job.status,
          t69Job.companyId,
          {
            sourcingAccessReceivedAt: plantedAccessAt,
            shortlistingDueAt: plantedDueAt,
          },
        ),
      WORKFLOW_TIMESTAMP_ERROR,
      "TEST A: updateJob validator rejects planted T69 timestamps",
    );

    const afterT69Plant = await prisma.job.findUniqueOrThrow({
      where: { id: t69Job.id },
      select: {
        requirementLifecycle: true,
        sourcingAccessReceivedAt: true,
        shortlistingDueAt: true,
      },
    });
    assert(
      afterT69Plant.requirementLifecycle === "INTERVIEWER_NOTIFIED",
      "TEST A: lifecycle remains INTERVIEWER_NOTIFIED",
    );
    assert(
      afterT69Plant.sourcingAccessReceivedAt === null,
      "TEST A: sourcingAccessReceivedAt remains null",
    );
    assert(
      afterT69Plant.shortlistingDueAt === null,
      "TEST A: shortlistingDueAt remains null",
    );
    assert(
      (await prisma.notification.count({
        where: {
          jobId: t69Job.id,
          type: "INTERVIEWER_DATABASE_READY",
        },
      })) === 0,
      "TEST A: no INTERVIEWER_DATABASE_READY",
    );

    const t70Job = await createTmpJob({
      prefix: PREFIX,
      title: "T70 Timestamp Bypass",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: plantedAccessAt,
      shortlistingDueAt: plantedDueAt,
    });

    await assertThrows(
      () =>
        validateJobInput(
          t70Job.title,
          t70Job.status,
          t70Job.companyId,
          {
            shortlistingCompletedAt: new Date(),
          },
        ),
      WORKFLOW_TIMESTAMP_ERROR,
      "TEST B: updateJob validator rejects planted T70 timestamp",
    );

    const afterT70Plant = await prisma.job.findUniqueOrThrow({
      where: { id: t70Job.id },
      select: {
        shortlistingCompletedAt: true,
      },
    });
    assert(
      afterT70Plant.shortlistingCompletedAt === null,
      "TEST B: shortlistingCompletedAt remains null",
    );
    assert(
      (await prisma.notification.count({
        where: {
          jobId: t70Job.id,
          type: "CLIENT_SHORTLIST_READY",
        },
      })) === 0,
      "TEST B: no CLIENT_SHORTLIST_READY",
    );

    await assertThrows(
      () =>
        validateJobInput(
          "Planted Create",
          "OPEN",
          qa.companyAlpha.id,
          {
            clientCompletedAt: new Date(),
            sourcingAccessReceivedAt: plantedAccessAt,
            shortlistingDueAt: plantedDueAt,
            shortlistingCompletedAt: new Date(),
          },
          {
            allowRequirementLifecycle: true,
            requireDraftLifecycle: true,
          },
        ),
      WORKFLOW_TIMESTAMP_ERROR,
      "TEST C: createJob validator rejects workflow timestamps",
    );

    const legitimateT69 = await recordSourcingAccessHandoff(t69Job.id);
    assert(legitimateT69.established, "TEST D: T69 handoff established");
    assert(
      legitimateT69.job.requirementLifecycle === "SOURCING_SHORTLISTING",
      "TEST D: lifecycle SOURCING_SHORTLISTING",
    );
    assert(
      legitimateT69.job.sourcingAccessReceivedAt !== null,
      "TEST D: sourcingAccessReceivedAt set",
    );
    assert(
      legitimateT69.job.shortlistingDueAt !== null,
      "TEST D: shortlistingDueAt set",
    );
    assert(
      legitimateT69.job.shortlistingDueAt!.getTime() -
        legitimateT69.job.sourcingAccessReceivedAt!.getTime() ===
        SLA_MS,
      "TEST D: SLA is access + 24h",
    );
    assert(
      (await prisma.notification.count({
        where: {
          jobId: t69Job.id,
          type: "INTERVIEWER_DATABASE_READY",
        },
      })) === 1,
      "TEST D: exactly one INTERVIEWER_DATABASE_READY",
    );

    await createTmpApplication({
      prefix: PREFIX,
      jobId: t69Job.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "T70Yes",
    });
    const legitimateT70 = await recordShortlistCompletionHandoff(t69Job.id);
    assert(legitimateT70.established, "TEST E: T70 handoff established");
    assert(
      legitimateT70.job.shortlistingCompletedAt !== null,
      "TEST E: shortlistingCompletedAt set",
    );
    assert(
      (await prisma.notification.count({
        where: {
          jobId: t69Job.id,
          type: "CLIENT_SHORTLIST_READY",
        },
      })) === 1,
      "TEST E: exactly one CLIENT_SHORTLIST_READY",
    );

    await assertThrows(
      () => recordShortlistCompletionHandoff(t70Job.id),
      (error) =>
        error instanceof JobValidationError &&
        error.message.includes(
          "Cannot complete shortlisting until at least one candidate has been shortlisted",
        ),
      "TEST F: T70 zero-SHORTLISTED still rejected",
    );
    assert(
      (
        await prisma.job.findUniqueOrThrow({
          where: { id: t70Job.id },
          select: { shortlistingCompletedAt: true },
        })
      ).shortlistingCompletedAt === null,
      "TEST F: shortlistingCompletedAt remains null",
    );

    await assertThrows(
      () =>
        validateJobInput(
          "T67 Plant",
          "OPEN",
          qa.companyAlpha.id,
          {
            clientCompletedAt: new Date(),
          },
        ),
      WORKFLOW_TIMESTAMP_ERROR,
      "TEST G: generic CRUD cannot plant clientCompletedAt",
    );

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  } finally {
    if (previousResendKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = previousResendKey;
    }
  }
}
