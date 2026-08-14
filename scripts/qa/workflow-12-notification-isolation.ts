import { notificationScopeWhere } from "../../lib/auth/authorization";
import { dispatchInAppNotification } from "../../lib/communication/notification-service";
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

const PREFIX = `${TMP_PREFIX}-W12`;

export async function runWorkflow12() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  const previousResendKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    console.log("W12 notification isolation");

    const alphaJob = await createTmpJob({
      prefix: PREFIX,
      title: "Alpha Comms",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "INTERVIEWER_NOTIFIED",
    });
    const betaJob = await createTmpJob({
      prefix: PREFIX,
      title: "Beta Comms",
      companyId: qa.companyBeta.id,
      assignedInterviewerId: qa.interviewerBeta.id,
      requirementLifecycle: "INTERVIEWER_NOTIFIED",
    });

    await dispatchInAppNotification({
      type: "INTERVIEWER_REQUIREMENT_READY",
      jobId: alphaJob.id,
      message: `${PREFIX} Alpha T68`,
    });
    await dispatchInAppNotification({
      type: "INTERVIEWER_REQUIREMENT_READY",
      jobId: betaJob.id,
      message: `${PREFIX} Beta T68`,
    });

    const alphaAccess = await recordSourcingAccessHandoff(alphaJob.id);
    const betaAccess = await recordSourcingAccessHandoff(betaJob.id);
    assert(alphaAccess.established && betaAccess.established, "T69 both tenants");

    await createTmpApplication({
      prefix: PREFIX,
      jobId: alphaJob.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "AlphaSL",
    });
    await createTmpApplication({
      prefix: PREFIX,
      jobId: betaJob.id,
      companyId: qa.companyBeta.id,
      status: "SHORTLISTED",
      label: "BetaSL",
    });
    const alphaT70 = await recordShortlistCompletionHandoff(alphaJob.id);
    const betaT70 = await recordShortlistCompletionHandoff(betaJob.id);
    assert(alphaT70.established && betaT70.established, "T70 both tenants");

    const jobIds = [alphaJob.id, betaJob.id];

    const adminVisible = await prisma.notification.findMany({
      where: {
        AND: [notificationScopeWhere(qa.admin), { jobId: { in: jobIds } }],
      },
      select: { type: true, jobId: true },
    });
    const adminTypes = new Set(adminVisible.map((row) => row.type));
    assert(adminTypes.has("INTERVIEWER_REQUIREMENT_READY"), "Admin sees T68");
    assert(adminTypes.has("INTERVIEWER_DATABASE_READY"), "Admin sees T69");
    assert(adminTypes.has("CLIENT_SHORTLIST_READY"), "Admin sees T70");
    assert(adminVisible.length === 6, "Admin sees all 6 tenant events");

    const clientAlphaVisible = await prisma.notification.findMany({
      where: {
        AND: [notificationScopeWhere(qa.clientAlpha), { jobId: { in: jobIds } }],
      },
      select: { type: true, jobId: true, companyId: true },
    });
    assert(clientAlphaVisible.length === 1, "Client Alpha sees one event");
    assert(
      clientAlphaVisible[0]?.type === "CLIENT_SHORTLIST_READY" &&
        clientAlphaVisible[0]?.jobId === alphaJob.id &&
        clientAlphaVisible[0]?.companyId === qa.companyAlpha.id,
      "Client Alpha sees only own T70",
    );

    const clientBetaVisible = await prisma.notification.findMany({
      where: {
        AND: [notificationScopeWhere(qa.clientBeta), { jobId: { in: jobIds } }],
      },
      select: { type: true, jobId: true },
    });
    assert(clientBetaVisible.length === 1, "Client Beta sees one event");
    assert(
      clientBetaVisible[0]?.type === "CLIENT_SHORTLIST_READY" &&
        clientBetaVisible[0]?.jobId === betaJob.id,
      "Client Beta sees only own T70",
    );

    const interviewerAlphaVisible = await prisma.notification.findMany({
      where: {
        AND: [
          notificationScopeWhere(qa.interviewerAlphaUser),
          { jobId: { in: jobIds } },
        ],
      },
      select: { type: true, jobId: true, interviewerId: true },
    });
    assert(interviewerAlphaVisible.length === 2, "Interviewer Alpha sees T68+T69");
    assert(
      interviewerAlphaVisible.every(
        (row) =>
          row.jobId === alphaJob.id &&
          row.interviewerId === qa.interviewerAlpha.id &&
          (row.type === "INTERVIEWER_REQUIREMENT_READY" ||
            row.type === "INTERVIEWER_DATABASE_READY"),
      ),
      "Interviewer Alpha sees only own T68/T69",
    );
    assert(
      interviewerAlphaVisible.every((row) => row.type !== "CLIENT_SHORTLIST_READY"),
      "Interviewer Alpha cannot see T70",
    );

    const interviewerBetaVisible = await prisma.notification.findMany({
      where: {
        AND: [
          notificationScopeWhere(qa.interviewerBetaUser),
          { jobId: { in: jobIds } },
        ],
      },
      select: { type: true, jobId: true, interviewerId: true },
    });
    assert(interviewerBetaVisible.length === 2, "Interviewer Beta sees T68+T69");
    assert(
      interviewerBetaVisible.every(
        (row) =>
          row.jobId === betaJob.id &&
          row.interviewerId === qa.interviewerBeta.id,
      ),
      "Interviewer Beta sees only own events",
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
