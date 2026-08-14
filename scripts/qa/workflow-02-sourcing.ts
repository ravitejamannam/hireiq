import { recordSourcingAccessHandoff } from "../../lib/jobs/sourcing-access-handoff";
import { SHORTLISTING_SLA_HOURS } from "../../lib/jobs/sourcing-access-handoff";
import {
  assertSourcingAccessCanBeRecorded,
  validateJobLifecycleTransition,
} from "../../lib/validation/job-validation";
import { assert, assertThrows } from "./assertions";
import {
  cleanupPrefix,
  createTmpJob,
  loadV1Qa,
  prisma,
  source,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W02`;
const SLA_MS = SHORTLISTING_SLA_HOURS * 60 * 60 * 1000;

export async function runWorkflow02() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  const previousResendKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    console.log("W02 database access / SLA");

    assert(
      assertSourcingAccessCanBeRecorded("INTERVIEWER_NOTIFIED", null) === "READY",
      "handoff ready when INTERVIEWER_NOTIFIED and access unset",
    );
    await assertThrows(
      () => assertSourcingAccessCanBeRecorded("REQUIREMENT_POSTED", null),
      "Invalid sourcing workflow state",
      "cannot record access before INTERVIEWER_NOTIFIED",
    );

    const jobActions = source("app/actions/job-actions.ts");
    assert(
      jobActions.includes("export async function markJobSourcingAccessReceived"),
      "T69 production trigger remains markJobSourcingAccessReceived",
    );
    assert(
      jobActions.includes("recordSourcingAccessHandoff"),
      "T69 action still uses recordSourcingAccessHandoff",
    );
    assert(
      /export async function transitionJobLifecycle[\s\S]*?validateJobLifecycleTransition/.test(
        jobActions,
      ),
      "generic lifecycle action still goes through validateJobLifecycleTransition",
    );

    const job = await createTmpJob({
      prefix: PREFIX,
      title: "Database Access",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "INTERVIEWER_NOTIFIED",
    });

    await assertThrows(
      () =>
        validateJobLifecycleTransition(
          "INTERVIEWER_NOTIFIED",
          "SOURCING_SHORTLISTING",
        ),
      "Sourcing access must be recorded through the database-access workflow",
      "generic Admin transition cannot skip T69",
    );

    const afterBypassAttempt = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      select: {
        requirementLifecycle: true,
        sourcingAccessReceivedAt: true,
        shortlistingDueAt: true,
      },
    });
    assert(
      afterBypassAttempt.requirementLifecycle === "INTERVIEWER_NOTIFIED",
      "bypass rejection leaves lifecycle INTERVIEWER_NOTIFIED",
    );
    assert(
      afterBypassAttempt.sourcingAccessReceivedAt === null,
      "bypass rejection leaves sourcingAccessReceivedAt null",
    );
    assert(
      afterBypassAttempt.shortlistingDueAt === null,
      "bypass rejection leaves shortlistingDueAt null",
    );
    assert(
      (await prisma.notification.count({
        where: {
          jobId: job.id,
          type: "INTERVIEWER_DATABASE_READY",
        },
      })) === 0,
      "bypass rejection creates no INTERVIEWER_DATABASE_READY",
    );

    const first = await recordSourcingAccessHandoff(job.id);
    assert(first.established, "first T69 handoff established");
    assert(first.job.requirementLifecycle === "SOURCING_SHORTLISTING", "lifecycle advanced");
    assert(first.job.sourcingAccessReceivedAt !== null, "sourcingAccessReceivedAt set");
    assert(first.job.shortlistingDueAt !== null, "shortlistingDueAt set");
    assert(
      first.job.shortlistingDueAt!.getTime() -
        first.job.sourcingAccessReceivedAt!.getTime() ===
        SLA_MS,
      "SLA is exactly 24 hours",
    );
    assert(first.inApp.created, "T69 in-app created");
    assert(
      first.inApp.notification.type === "INTERVIEWER_DATABASE_READY",
      "T69 type",
    );

    const accessAt = first.job.sourcingAccessReceivedAt!.getTime();
    const dueAt = first.job.shortlistingDueAt!.getTime();

    const second = await recordSourcingAccessHandoff(job.id);
    assert(!second.established, "repeat handoff is not a new event");
    assert(
      second.job.sourcingAccessReceivedAt?.getTime() === accessAt,
      "sourcingAccessReceivedAt not reset",
    );
    assert(
      second.job.shortlistingDueAt?.getTime() === dueAt,
      "shortlistingDueAt not reset",
    );

    const t69Count = await prisma.notification.count({
      where: {
        jobId: job.id,
        type: "INTERVIEWER_DATABASE_READY",
      },
    });
    assert(t69Count === 1, "exactly one T69 notification");

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
