/**
 * T76: communication failure after commit / email retry.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * notifyAssignedInterviewer / markJobSourcingAccessReceived /
 * completeJobShortlisting / retryNotificationEmailDelivery require Auth.js.
 *
 * Tests the production finalize/retry/delivery functions those actions call.
 */
import {
  AuthorizationError,
  assertCanRetryNotificationEmail,
  notificationScopeWhere,
} from "../../lib/auth/authorization";
import { sendOutboundEmail } from "../../lib/communication/email-transport";
import {
  dispatchClientInAppNotification,
  dispatchInAppNotification,
  finalizeDatabaseReadyCommunication,
  finalizeRequirementReadyCommunication,
  finalizeShortlistReadyCommunication,
  retryNotificationEmail,
} from "../../lib/communication/notification-service";
import { recordSourcingAccessHandoff } from "../../lib/jobs/sourcing-access-handoff";
import { recordShortlistCompletionHandoff } from "../../lib/jobs/shortlist-completion-handoff";
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

const PREFIX = `${TMP_PREFIX}-W17`;

export async function runWorkflow17() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  const previousResendKey = process.env.RESEND_API_KEY;
  const previousEmailFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;

  try {
    console.log("W17 email retry after commit");

    const jobActions = source("app/actions/job-actions.ts");
    const communicationActions = source(
      "app/actions/communication-actions.ts",
    );
    const notificationService = source(
      "lib/communication/notification-service.ts",
    );
    const emailTransport = source("lib/communication/email-transport.ts");

    assertIncludes(
      jobActions,
      "job: updatedJob",
      "T68 action returns committed job instead of throwing on email failure",
    );
    assertNotIncludes(
      jobActions,
      "Interviewer was notified in-app, but the requirement-ready email could not be sent.",
      "T68 action no longer throws after email provider error",
    );
    assertIncludes(
      communicationActions,
      "await requireUser()",
      "retry action is authenticated",
    );
    assertIncludes(
      communicationActions,
      "assertCanRetryNotificationEmail(user)",
      "retry is Admin-gated",
    );
    assertIncludes(
      communicationActions,
      "retryNotificationEmail(notification.id)",
      "retry uses the existing notification id",
    );
    assertNotIncludes(
      communicationActions,
      "email:",
      "retry action does not accept caller email",
    );
    assertIncludes(
      notificationService,
      "export async function retryNotificationEmail",
      "retry lives in the communication service",
    );
    assertIncludes(
      notificationService,
      'reason: "already-delivered"',
      "successful delivery is idempotent on retry",
    );
    assertIncludes(
      emailTransport,
      "reason: \"provider-error\"",
      "transport maps provider exceptions to provider-error",
    );

    const t68Job = await createTmpJob({
      prefix: PREFIX,
      title: "T68 Email Retry",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "REQUIREMENT_POSTED",
    });
    await prisma.job.update({
      where: { id: t68Job.id },
      data: { requirementLifecycle: "INTERVIEWER_NOTIFIED" },
    });
    const t68First = await dispatchInAppNotification({
      type: "INTERVIEWER_REQUIREMENT_READY",
      jobId: t68Job.id,
      message: `${PREFIX} T68`,
    });
    assert(t68First.created, "TEST A: T68 in-app created");
    const t68Email = await finalizeRequirementReadyCommunication(t68First);
    assert(t68Email.attempted === true, "TEST A: email attempted");
    assert(t68Email.sent === false, "TEST A: email not sent");
    assert(
      t68Email.reason === "provider-not-configured",
      "TEST A: provider-not-configured",
    );
    const t68JobAfter = await prisma.job.findUniqueOrThrow({
      where: { id: t68Job.id },
      select: { requirementLifecycle: true },
    });
    assert(
      t68JobAfter.requirementLifecycle === "INTERVIEWER_NOTIFIED",
      "TEST A: lifecycle remains INTERVIEWER_NOTIFIED",
    );
    const t68Row = await prisma.notification.findFirstOrThrow({
      where: { jobId: t68Job.id, type: "INTERVIEWER_REQUIREMENT_READY" },
      select: { id: true, emailDeliveredAt: true, interviewerId: true },
    });
    assert(t68Row.emailDeliveredAt === null, "TEST A: email not marked delivered");
    assert(
      (await prisma.notification.count({
        where: { jobId: t68Job.id, type: "INTERVIEWER_REQUIREMENT_READY" },
      })) === 1,
      "TEST A: exactly one T68",
    );

    const t68Retry = await retryNotificationEmail(t68Row.id);
    assert(t68Retry.attempted === true, "TEST B: retry attempted");
    assert(t68Retry.sent === false, "TEST B: retry still not sent without provider");
    assert(
      (await prisma.notification.count({
        where: { jobId: t68Job.id, type: "INTERVIEWER_REQUIREMENT_READY" },
      })) === 1,
      "TEST B: retry does not create another T68",
    );

    const t69Job = await createTmpJob({
      prefix: PREFIX,
      title: "T69 Email Retry",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "INTERVIEWER_NOTIFIED",
    });
    const t69Handoff = await recordSourcingAccessHandoff(t69Job.id);
    assert(t69Handoff.established && t69Handoff.inApp, "TEST C: T69 established");
    const t69Email = await finalizeDatabaseReadyCommunication(t69Handoff.inApp);
    assert(t69Email.attempted === true && t69Email.sent === false, "TEST C: T69 email not sent");
    const t69After = await prisma.job.findUniqueOrThrow({
      where: { id: t69Job.id },
      select: {
        requirementLifecycle: true,
        sourcingAccessReceivedAt: true,
        shortlistingDueAt: true,
      },
    });
    assert(
      t69After.requirementLifecycle === "SOURCING_SHORTLISTING",
      "TEST C: SOURCING_SHORTLISTING",
    );
    assert(Boolean(t69After.sourcingAccessReceivedAt), "TEST C: access timestamp set");
    assert(
      t69After.sourcingAccessReceivedAt &&
        t69After.shortlistingDueAt &&
        t69After.shortlistingDueAt.getTime() -
          t69After.sourcingAccessReceivedAt.getTime() ===
          24 * 60 * 60 * 1000,
      "TEST C: 24h SLA",
    );
    const t69Row = await prisma.notification.findFirstOrThrow({
      where: { jobId: t69Job.id, type: "INTERVIEWER_DATABASE_READY" },
      select: { id: true, emailDeliveredAt: true },
    });
    assert(t69Row.emailDeliveredAt === null, "TEST C: T69 email not delivered");
    const accessAt = t69After.sourcingAccessReceivedAt;
    const dueAt = t69After.shortlistingDueAt;
    const t69Retry = await retryNotificationEmail(t69Row.id);
    assert(t69Retry.attempted === true, "TEST D: T69 retry attempted");
    const t69AfterRetry = await prisma.job.findUniqueOrThrow({
      where: { id: t69Job.id },
      select: {
        sourcingAccessReceivedAt: true,
        shortlistingDueAt: true,
      },
    });
    assert(
      t69AfterRetry.sourcingAccessReceivedAt?.getTime() === accessAt?.getTime(),
      "TEST D: access timestamp unchanged",
    );
    assert(
      t69AfterRetry.shortlistingDueAt?.getTime() === dueAt?.getTime(),
      "TEST D: SLA unchanged",
    );
    assert(
      (await prisma.notification.count({
        where: { jobId: t69Job.id, type: "INTERVIEWER_DATABASE_READY" },
      })) === 1,
      "TEST D: no duplicate T69",
    );

    const t70Job = await createTmpJob({
      prefix: PREFIX,
      title: "T70 Email Retry",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
      shortlistingDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await createTmpApplication({
      prefix: PREFIX,
      jobId: t70Job.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "T70",
    });
    const t70Handoff = await recordShortlistCompletionHandoff(t70Job.id);
    assert(t70Handoff.established && t70Handoff.inApp, "TEST E: T70 established");
    const t70Email = await finalizeShortlistReadyCommunication(t70Handoff.inApp);
    assert(t70Email.attempted === true && t70Email.sent === false, "TEST E: T70 email not sent");
    const t70After = await prisma.job.findUniqueOrThrow({
      where: { id: t70Job.id },
      select: { shortlistingCompletedAt: true },
    });
    assert(Boolean(t70After.shortlistingCompletedAt), "TEST E: completedAt set");
    const t70Row = await prisma.notification.findFirstOrThrow({
      where: { jobId: t70Job.id, type: "CLIENT_SHORTLIST_READY" },
      select: { id: true, emailDeliveredAt: true },
    });
    const completedAt = t70After.shortlistingCompletedAt;
    const t70Retry = await retryNotificationEmail(t70Row.id);
    assert(t70Retry.attempted === true, "TEST F: T70 retry attempted");
    const t70AfterRetry = await prisma.job.findUniqueOrThrow({
      where: { id: t70Job.id },
      select: { shortlistingCompletedAt: true },
    });
    assert(
      t70AfterRetry.shortlistingCompletedAt?.getTime() === completedAt?.getTime(),
      "TEST F: shortlistingCompletedAt unchanged",
    );
    assert(
      (await prisma.notification.count({
        where: { jobId: t70Job.id, type: "CLIENT_SHORTLIST_READY" },
      })) === 1,
      "TEST F: no duplicate T70",
    );

    process.env.RESEND_API_KEY = "invalid-t76-key";
    process.env.EMAIL_FROM = "HireIQ <noreply@example.com>";
    const providerError = await sendOutboundEmail({
      to: "v1qa.interviewer.alpha@hireiq.local",
      subject: `${PREFIX} provider error`,
      text: "test",
      html: "<p>test</p>",
    });
    assert(
      providerError.sent === false && providerError.reason === "provider-error",
      "TEST G: invalid provider config/network becomes provider-error",
    );
    const t68AfterProviderError = await prisma.job.findUniqueOrThrow({
      where: { id: t68Job.id },
      select: { requirementLifecycle: true },
    });
    assert(
      t68AfterProviderError.requirementLifecycle === "INTERVIEWER_NOTIFIED",
      "TEST G: T68 workflow remains committed",
    );
    const retryAfterError = await retryNotificationEmail(t68Row.id);
    assert(retryAfterError.attempted === true, "TEST G: retry remains possible");
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    assertIncludes(
      notificationService,
      "deliverRequirementReadyEmail(notification.jobId)",
      "TEST H: T68 retry recipient from job",
    );
    assertIncludes(
      notificationService,
      "deliverDatabaseReadyEmail(notification.jobId)",
      "TEST H: T69 retry recipient from job",
    );
    assertIncludes(
      notificationService,
      "deliverShortlistReadyEmail(notification.jobId)",
      "TEST H: T70 retry recipient from job",
    );
    assert(
      t68Row.interviewerId === qa.interviewerAlpha.id,
      "TEST H: T68 stored interviewer is Alpha",
    );

    await assertThrows(
      () => assertCanRetryNotificationEmail(qa.clientAlpha),
      (error) => error instanceof AuthorizationError,
      "TEST I: Client cannot retry",
    );
    await assertThrows(
      () => assertCanRetryNotificationEmail(qa.interviewerAlphaUser),
      (error) => error instanceof AuthorizationError,
      "TEST I: Interviewer cannot retry",
    );
    assertCanRetryNotificationEmail(qa.admin);
    const betaT68 = await prisma.notification.findFirst({
      where: {
        AND: [
          { id: t68Row.id },
          notificationScopeWhere(qa.clientBeta),
        ],
      },
    });
    assert(betaT68 === null, "TEST I: Beta client cannot see Alpha T68");
    const betaInterviewerT70 = await prisma.notification.findFirst({
      where: {
        AND: [
          { id: t70Row.id },
          notificationScopeWhere(qa.interviewerBetaUser),
        ],
      },
    });
    assert(
      betaInterviewerT70 === null,
      "TEST I: Beta interviewer cannot see Alpha T70",
    );

    const duplicateDispatch = await dispatchInAppNotification({
      type: "INTERVIEWER_REQUIREMENT_READY",
      jobId: t68Job.id,
      message: `${PREFIX} T68 duplicate`,
    });
    assert(!duplicateDispatch.created, "TEST J: dispatch does not duplicate");
    await retryNotificationEmail(t68Row.id);
    assert(
      (await prisma.notification.count({
        where: { jobId: t68Job.id, type: "INTERVIEWER_REQUIREMENT_READY" },
      })) === 1,
      "TEST J: retry does not create another Notification",
    );

    await prisma.notification.update({
      where: { id: t68Row.id },
      data: { emailDeliveredAt: new Date() },
    });
    const afterDelivered = await retryNotificationEmail(t68Row.id);
    assert(
      afterDelivered.attempted === false &&
        afterDelivered.reason === "already-delivered",
      "TEST K: successful delivery is not resent",
    );
    assert(
      (await prisma.notification.count({
        where: { jobId: t68Job.id, type: "INTERVIEWER_REQUIREMENT_READY" },
      })) === 1,
      "TEST K: still one T68",
    );

    await dispatchClientInAppNotification({
      type: "CLIENT_SHORTLIST_READY",
      jobId: t69Job.id,
      message: `${PREFIX} extra T70 on T69 job`,
    });
    assert(
      (await prisma.notification.count({
        where: { jobId: t68Job.id, type: "INTERVIEWER_REQUIREMENT_READY" },
      })) === 1,
      "TEST L: one T68",
    );
    assert(
      (await prisma.notification.count({
        where: { jobId: t69Job.id, type: "INTERVIEWER_DATABASE_READY" },
      })) === 1,
      "TEST L: one T69",
    );
    assert(
      (await prisma.notification.count({
        where: { jobId: t70Job.id, type: "CLIENT_SHORTLIST_READY" },
      })) === 1,
      "TEST L: one T70",
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
    if (previousEmailFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = previousEmailFrom;
    }
  }
}
