import {
  assertAdmin,
  assertInterviewerJobAccess,
  AuthorizationError,
} from "../../lib/auth/authorization";
import { validateJobLifecycleTransition } from "../../lib/validation/job-validation";
import { assert, assertIncludes, assertThrows } from "./assertions";
import {
  cleanupPrefix,
  createTmpJob,
  loadV1Qa,
  source,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W01`;

export async function runWorkflow01() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W01 requirement lifecycle");

    const jobActions = source("app/actions/job-actions.ts");
    assertIncludes(jobActions, "await requireAdmin()", "lifecycle mutations are Admin-gated");
    assertIncludes(
      jobActions,
      'export async function completeJobRequirement',
      "Client/Admin completion workflow exists",
    );
    assertIncludes(
      jobActions,
      'throw new AuthorizationError("Unauthorized.")',
      "Interviewer cannot complete requirement",
    );
    assertIncludes(
      jobActions,
      "export async function notifyAssignedInterviewer",
      "T68 notify path exists",
    );

    assert(
      validateJobLifecycleTransition("REQUIREMENT_DRAFTED", "CLIENT_NOTIFIED") ===
        "CLIENT_NOTIFIED",
      "DRAFTED -> CLIENT_NOTIFIED allowed",
    );

    await assertThrows(
      () => validateJobLifecycleTransition("REQUIREMENT_DRAFTED", "REQUIREMENT_POSTED"),
      "Invalid requirement lifecycle transition",
      "skip DRAFTED -> POSTED rejected",
    );
    await assertThrows(
      () =>
        validateJobLifecycleTransition("REQUIREMENT_DRAFTED", "SOURCING_SHORTLISTING"),
      "Invalid requirement lifecycle transition",
      "skip DRAFTED -> SOURCING rejected",
    );
    await assertThrows(
      () =>
        validateJobLifecycleTransition("CLIENT_NOTIFIED", "REQUIREMENT_POSTED"),
      "Requirement must be completed through the completion workflow",
      "POSTED is not a generic Admin skip",
    );
    await assertThrows(
      () =>
        validateJobLifecycleTransition("REQUIREMENT_POSTED", "INTERVIEWER_NOTIFIED"),
      "Interviewer must be notified through the notification workflow",
      "INTERVIEWER_NOTIFIED is not a generic Admin skip",
    );
    await assertThrows(
      () =>
        validateJobLifecycleTransition(
          "INTERVIEWER_NOTIFIED",
          "SOURCING_SHORTLISTING",
        ),
      "Sourcing access must be recorded through the database-access workflow",
      "SOURCING_SHORTLISTING is not a generic Admin skip",
    );
    await assertThrows(
      () =>
        validateJobLifecycleTransition("CLIENT_NOTIFIED", "INTERVIEWER_NOTIFIED"),
      "Invalid requirement lifecycle transition",
      "CLIENT_NOTIFIED cannot skip to INTERVIEWER_NOTIFIED",
    );

    const job = await createTmpJob({
      prefix: PREFIX,
      title: "Lifecycle",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "REQUIREMENT_DRAFTED",
    });

    await assertThrows(
      () => {
        assertAdmin(qa.interviewerAlphaUser);
      },
      (error) => error instanceof AuthorizationError,
      "Interviewer cannot act as Admin",
    );
    await assertThrows(
      () => {
        assertAdmin(qa.clientAlpha);
      },
      (error) => error instanceof AuthorizationError,
      "Client cannot act as Admin",
    );
    assertAdmin(qa.admin);

    await assertThrows(
      () => {
        assertInterviewerJobAccess(qa.interviewerBetaUser, {
          assignedInterviewerId: qa.interviewerAlpha.id,
        });
      },
      (error) => error instanceof AuthorizationError,
      "Beta interviewer cannot operate Alpha assignment",
    );
    assertInterviewerJobAccess(qa.interviewerAlphaUser, {
      assignedInterviewerId: job.assignedInterviewerId,
    });

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
