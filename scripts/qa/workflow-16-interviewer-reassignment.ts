/**
 * T75 / T72-P1-06: interviewer assignment is frozen after T68.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * assignInterviewerToJob / notifyAssignedInterviewer /
 * markJobSourcingAccessReceived require Auth.js request scope.
 *
 * This workflow tests the production freeze assert that assignInterviewerToJob
 * calls, T68/T69 recipient derivation, Interviewer scope, and source scans.
 *
 * TEST I choice: same-interviewer after lock is idempotent (no throw).
 * TEST J: assignInterviewerToJob still updates by id after the read-check
 * (TOCTOU vs notify). Documented as P2 — no new locking architecture.
 */
import { jobScopeWhere } from "../../lib/auth/authorization";
import { dispatchInAppNotification } from "../../lib/communication/notification-service";
import { isInterviewerAssignmentLocked } from "../../lib/jobs/interviewer-assignment-lock";
import { recordSourcingAccessHandoff } from "../../lib/jobs/sourcing-access-handoff";
import {
  assertInterviewerAssignmentNotLocked,
} from "../../lib/validation/job-validation";
import { assert, assertIncludes, assertNotIncludes, assertThrows } from "./assertions";
import {
  cleanupPrefix,
  createTmpJob,
  loadV1Qa,
  prisma,
  source,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W16`;
const ASSIGNMENT_LOCKED_ERROR =
  "Interviewer assignment is locked after interviewer notification.";

async function applyAssignmentIfUnlocked(params: {
  jobId: number;
  currentLifecycle: "REQUIREMENT_POSTED" | "INTERVIEWER_NOTIFIED" | "SOURCING_SHORTLISTING" | "BILLING_GENERATED";
  currentAssignedInterviewerId: number | null;
  nextAssignedInterviewerId: number | null;
}) {
  assertInterviewerAssignmentNotLocked(
    params.currentLifecycle,
    params.currentAssignedInterviewerId,
    params.nextAssignedInterviewerId,
  );

  if (params.currentAssignedInterviewerId === params.nextAssignedInterviewerId) {
    return prisma.job.findUniqueOrThrow({
      where: { id: params.jobId },
      select: { assignedInterviewerId: true, requirementLifecycle: true },
    });
  }

  return prisma.job.update({
    where: { id: params.jobId },
    data: { assignedInterviewerId: params.nextAssignedInterviewerId },
    select: { assignedInterviewerId: true, requirementLifecycle: true },
  });
}

export async function runWorkflow16() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  const previousResendKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    console.log("W16 interviewer reassignment freeze");

    const jobActions = source("app/actions/job-actions.ts");
    const jobValidation = source("lib/validation/job-validation.ts");
    const jobCard = source("components/jobs/JobCard.tsx");
    const workspace = source(
      "components/requirements/RequirementWorkspaceClient.tsx",
    );
    const genericInput = source("lib/validation/job-validation.ts");

    assertIncludes(
      jobActions,
      "assertInterviewerAssignmentNotLocked",
      "assignInterviewerToJob is gated by the assignment freeze",
    );
    assertIncludes(
      jobValidation,
      ASSIGNMENT_LOCKED_ERROR,
      "freeze uses a domain validation error",
    );
    assertIncludes(
      jobCard,
      "isInterviewerAssignmentLocked",
      "JobCard disables assignment after notification",
    );
    assertIncludes(
      workspace,
      "isInterviewerAssignmentLocked",
      "Requirement workspace disables assignment after notification",
    );
    assertNotIncludes(
      genericInput,
      "assignedInterviewerId?: unknown",
      "generic Job CRUD cannot plant assignedInterviewerId",
    );

    const job = await createTmpJob({
      prefix: PREFIX,
      title: "Reassignment Freeze",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: null,
      requirementLifecycle: "REQUIREMENT_POSTED",
    });

    const assigned = await applyAssignmentIfUnlocked({
      jobId: job.id,
      currentLifecycle: "REQUIREMENT_POSTED",
      currentAssignedInterviewerId: null,
      nextAssignedInterviewerId: qa.interviewerAlpha.id,
    });
    assert(
      assigned.assignedInterviewerId === qa.interviewerAlpha.id,
      "TEST A: assignment before notification works",
    );

    const t68 = await dispatchInAppNotification({
      type: "INTERVIEWER_REQUIREMENT_READY",
      jobId: job.id,
      message: `${PREFIX} T68 Alpha`,
    });
    assert(t68.created, "TEST B: T68 created");
    assert(
      t68.notification.interviewerId === qa.interviewerAlpha.id,
      "TEST B: T68 recipient is Alpha",
    );
    await prisma.job.update({
      where: { id: job.id },
      data: { requirementLifecycle: "INTERVIEWER_NOTIFIED" },
    });

    await assertThrows(
      () =>
        applyAssignmentIfUnlocked({
          jobId: job.id,
          currentLifecycle: "INTERVIEWER_NOTIFIED",
          currentAssignedInterviewerId: qa.interviewerAlpha.id,
          nextAssignedInterviewerId: qa.interviewerBeta.id,
        }),
      ASSIGNMENT_LOCKED_ERROR,
      "TEST C: Alpha → Beta after T68 rejected",
    );
    const afterRejectedReassign = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      select: { assignedInterviewerId: true },
    });
    assert(
      afterRejectedReassign.assignedInterviewerId === qa.interviewerAlpha.id,
      "TEST C: assignedInterviewerId remains Alpha",
    );

    assert(
      (await prisma.notification.count({
        where: { jobId: job.id, type: "INTERVIEWER_REQUIREMENT_READY" },
      })) === 1,
      "TEST D: only one T68",
    );

    const t69 = await recordSourcingAccessHandoff(job.id);
    assert(t69.established, "TEST E: T69 established for Alpha");
    await assertThrows(
      () =>
        applyAssignmentIfUnlocked({
          jobId: job.id,
          currentLifecycle: "SOURCING_SHORTLISTING",
          currentAssignedInterviewerId: qa.interviewerAlpha.id,
          nextAssignedInterviewerId: qa.interviewerBeta.id,
        }),
      ASSIGNMENT_LOCKED_ERROR,
      "TEST E: Alpha → Beta after T69 rejected",
    );
    const afterT69 = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      select: { assignedInterviewerId: true },
    });
    assert(
      afterT69.assignedInterviewerId === qa.interviewerAlpha.id,
      "TEST E: assignment remains Alpha after T69",
    );

    const t69Row = await prisma.notification.findFirst({
      where: { jobId: job.id, type: "INTERVIEWER_DATABASE_READY" },
      select: { interviewerId: true },
    });
    assert(t69Row?.interviewerId === qa.interviewerAlpha.id, "TEST F: T69 recipient is Alpha");
    assert(
      (await prisma.notification.count({
        where: { jobId: job.id, type: "INTERVIEWER_DATABASE_READY" },
      })) === 1,
      "TEST F: no extra T69",
    );

    const betaLookup = await prisma.job.findFirst({
      where: {
        AND: [{ id: job.id }, jobScopeWhere(qa.interviewerBetaUser)],
      },
    });
    assert(betaLookup === null, "TEST G: Beta scoped lookup returns nothing");

    const preNotifyJob = await createTmpJob({
      prefix: PREFIX,
      title: "Pre-notify Reassign",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "REQUIREMENT_POSTED",
    });
    const reassigned = await applyAssignmentIfUnlocked({
      jobId: preNotifyJob.id,
      currentLifecycle: "REQUIREMENT_POSTED",
      currentAssignedInterviewerId: qa.interviewerAlpha.id,
      nextAssignedInterviewerId: qa.interviewerBeta.id,
    });
    assert(
      reassigned.assignedInterviewerId === qa.interviewerBeta.id,
      "TEST H: reassignment before notification is allowed",
    );
    const t68Beta = await dispatchInAppNotification({
      type: "INTERVIEWER_REQUIREMENT_READY",
      jobId: preNotifyJob.id,
      message: `${PREFIX} T68 Beta`,
    });
    assert(
      t68Beta.notification.interviewerId === qa.interviewerBeta.id,
      "TEST H: T68 recipient is Beta",
    );

    assert(
      !isInterviewerAssignmentLocked("REQUIREMENT_POSTED"),
      "TEST H: REQUIREMENT_POSTED is not frozen",
    );

    assertInterviewerAssignmentNotLocked(
      "INTERVIEWER_NOTIFIED",
      qa.interviewerAlpha.id,
      qa.interviewerAlpha.id,
    );
    const sameAfterLock = await applyAssignmentIfUnlocked({
      jobId: job.id,
      currentLifecycle: "SOURCING_SHORTLISTING",
      currentAssignedInterviewerId: qa.interviewerAlpha.id,
      nextAssignedInterviewerId: qa.interviewerAlpha.id,
    });
    assert(
      sameAfterLock.assignedInterviewerId === qa.interviewerAlpha.id,
      "TEST I: same interviewer after lock is idempotent",
    );

    await assertThrows(
      () =>
        applyAssignmentIfUnlocked({
          jobId: job.id,
          currentLifecycle: "SOURCING_SHORTLISTING",
          currentAssignedInterviewerId: qa.interviewerAlpha.id,
          nextAssignedInterviewerId: null,
        }),
      ASSIGNMENT_LOCKED_ERROR,
      "TEST I: unassign after lock is rejected",
    );

    assert(
      jobActions.includes("prisma.job.update") &&
        jobActions.includes("assignedInterviewerId: validatedInterviewerId"),
      "TEST J: assignment write remains a post-check update (TOCTOU is P2)",
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
