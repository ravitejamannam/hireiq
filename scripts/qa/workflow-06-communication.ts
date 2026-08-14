import { dispatchInAppNotification } from "../../lib/communication/notification-service";
import { dispatchClientInAppNotification } from "../../lib/communication/notification-service";
import { finalizeDatabaseReadyCommunication } from "../../lib/communication/notification-service";
import { finalizeRequirementReadyCommunication } from "../../lib/communication/notification-service";
import { finalizeShortlistReadyCommunication } from "../../lib/communication/notification-service";
import { recordSourcingAccessHandoff } from "../../lib/jobs/sourcing-access-handoff";
import { recordShortlistCompletionHandoff } from "../../lib/jobs/shortlist-completion-handoff";
import { assert } from "./assertions";
import {
  cleanupPrefix,
  createTmpApplication,
  createTmpJob,
  loadV1Qa,
  prisma,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W06`;

export async function runWorkflow06() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  const previousResendKey = process.env.RESEND_API_KEY;
  const previousEmailFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;

  try {
    console.log("W06 communication idempotency");

    const t68Job = await createTmpJob({
      prefix: PREFIX,
      title: "T68 Ready",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "REQUIREMENT_POSTED",
    });

    const t68First = await dispatchInAppNotification({
      type: "INTERVIEWER_REQUIREMENT_READY",
      jobId: t68Job.id,
      message: `${PREFIX} requirement ready`,
    });
    assert(t68First.created, "T68 first create");
    const t68Email = await finalizeRequirementReadyCommunication(t68First);
    assert(t68Email.attempted === true, "T68 email attempted");
    assert(t68Email.sent === false, "T68 not faked as sent");
    assert(
      t68Email.reason === "provider-not-configured",
      "T68 provider-not-configured",
    );

    const t68Second = await dispatchInAppNotification({
      type: "INTERVIEWER_REQUIREMENT_READY",
      jobId: t68Job.id,
      message: `${PREFIX} requirement ready duplicate`,
    });
    assert(!t68Second.created, "T68 second does not create");
    const t68Skip = await finalizeRequirementReadyCommunication(t68Second);
    assert(t68Skip.attempted === false, "T68 repeat does not email");
    assert(
      (await prisma.notification.count({
        where: { jobId: t68Job.id, type: "INTERVIEWER_REQUIREMENT_READY" },
      })) === 1,
      "exactly one T68",
    );

    const t69Job = await createTmpJob({
      prefix: PREFIX,
      title: "T69 Ready",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "INTERVIEWER_NOTIFIED",
    });
    const t69First = await recordSourcingAccessHandoff(t69Job.id);
    assert(t69First.established, "T69 first established");
    const t69Email = await finalizeDatabaseReadyCommunication(t69First.inApp);
    assert(t69Email.attempted === true, "T69 email attempted");
    assert(t69Email.sent === false, "T69 not faked as sent");
    assert(
      t69Email.reason === "provider-not-configured",
      "T69 provider-not-configured",
    );
    const t69Second = await recordSourcingAccessHandoff(t69Job.id);
    assert(!t69Second.established, "T69 second not established");
    assert(
      (await prisma.notification.count({
        where: { jobId: t69Job.id, type: "INTERVIEWER_DATABASE_READY" },
      })) === 1,
      "exactly one T69",
    );

    const t70Job = await createTmpJob({
      prefix: PREFIX,
      title: "T70 Ready",
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
    const t70First = await recordShortlistCompletionHandoff(t70Job.id);
    assert(t70First.established, "T70 first established");
    const t70Email = await finalizeShortlistReadyCommunication(t70First.inApp);
    assert(t70Email.attempted === true, "T70 email attempted");
    assert(t70Email.sent === false, "T70 not faked as sent");
    assert(
      t70Email.reason === "provider-not-configured",
      "T70 provider-not-configured",
    );
    const t70Second = await recordShortlistCompletionHandoff(t70Job.id);
    assert(!t70Second.established, "T70 second not established");
    const t70Dup = await dispatchClientInAppNotification({
      type: "CLIENT_SHORTLIST_READY",
      jobId: t70Job.id,
      message: `${PREFIX} duplicate T70`,
    });
    assert(!t70Dup.created, "T70 unique constraint holds");
    assert(
      (await prisma.notification.count({
        where: { jobId: t70Job.id, type: "CLIENT_SHORTLIST_READY" },
      })) === 1,
      "exactly one T70",
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
