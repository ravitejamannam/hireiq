import { recordShortlistCompletionHandoff } from "../../lib/jobs/shortlist-completion-handoff";
import {
  assertShortlistingCanBeCompleted,
  JobValidationError,
} from "../../lib/validation/job-validation";
import { assert, assertThrows } from "./assertions";
import {
  cleanupPrefix,
  createTmpApplication,
  createTmpJob,
  loadV1Qa,
  prisma,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W05`;

export async function runWorkflow05() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  const previousResendKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    console.log("W05 zero shortlist protection");

    const accessAt = new Date();
    const job = await createTmpJob({
      prefix: PREFIX,
      title: "Zero Shortlist",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: accessAt,
      shortlistingDueAt: new Date(accessAt.getTime() + 24 * 60 * 60 * 1000),
    });
    await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: "TECH_EVALUATION",
      label: "NotShortlisted",
    });

    await assertThrows(
      () =>
        assertShortlistingCanBeCompleted(
          "SOURCING_SHORTLISTING",
          accessAt,
          null,
          0,
        ),
      "Cannot complete shortlisting until at least one candidate has been shortlisted",
      "predicate rejects zero SHORTLISTED",
    );

    await assertThrows(
      () => recordShortlistCompletionHandoff(job.id),
      (error) =>
        error instanceof JobValidationError &&
        error.message.includes(
          "Cannot complete shortlisting until at least one candidate has been shortlisted",
        ),
      "handoff rejects zero SHORTLISTED",
    );

    const afterReject = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      select: {
        shortlistingCompletedAt: true,
        sourcingAccessReceivedAt: true,
        shortlistingDueAt: true,
        requirementLifecycle: true,
      },
    });
    assert(
      afterReject.shortlistingCompletedAt === null,
      "shortlistingCompletedAt remains null",
    );
    assert(
      afterReject.sourcingAccessReceivedAt?.getTime() === accessAt.getTime(),
      "sourcingAccessReceivedAt unchanged",
    );
    assert(
      afterReject.requirementLifecycle === "SOURCING_SHORTLISTING",
      "lifecycle unchanged",
    );
    assert(
      (await prisma.notification.count({
        where: { jobId: job.id, type: "CLIENT_SHORTLIST_READY" },
      })) === 0,
      "no CLIENT_SHORTLIST_READY after reject",
    );

    await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "Shortlisted",
    });

    const success = await recordShortlistCompletionHandoff(job.id);
    assert(success.established, "completion succeeds with ≥1 SHORTLISTED");
    assert(success.job.shortlistingCompletedAt !== null, "timestamp set");
    assert(
      success.inApp.notification.type === "CLIENT_SHORTLIST_READY",
      "T70 notification created",
    );

    const repeat = await recordShortlistCompletionHandoff(job.id);
    assert(!repeat.established, "repeat completion is not a new event");
    assert(
      (await prisma.notification.count({
        where: { jobId: job.id, type: "CLIENT_SHORTLIST_READY" },
      })) === 1,
      "exactly one CLIENT_SHORTLIST_READY",
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
