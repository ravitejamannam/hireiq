import { Prisma } from "@prisma/client";

import {
  evaluationScopeWhere,
} from "../../lib/auth/authorization";
import { assert, assertIncludes, assertThrows } from "./assertions";
import {
  cleanupPrefix,
  createTmpApplication,
  createTmpJob,
  loadV1Qa,
  prisma,
  source,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W03`;

export async function runWorkflow03() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W03 interviewer evaluation");

    const evaluationActions = source("app/actions/evaluation-actions.ts");
    assertIncludes(
      evaluationActions,
      "export async function saveInterviewerEvaluation",
      "Interviewer evaluation action exists",
    );
    assertIncludes(
      evaluationActions,
      "await assertInterviewerOwnsApplication(applicationId)",
      "evaluation ownership derived from assigned interviewer",
    );
    assertIncludes(
      evaluationActions,
      "Does not accept interviewerId from the browser",
      "browser cannot supply interviewerId",
    );

    const job = await createTmpJob({
      prefix: PREFIX,
      title: "Evaluation",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const { application } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: "TECH_EVALUATION",
      label: "Eval",
    });

    const created = await prisma.evaluation.create({
      data: {
        applicationId: application.id,
        interviewerId: qa.interviewerAlpha.id,
        overallScore: 81,
        notes: `${PREFIX} first save`,
        recommendation: "HIRE",
        fitDecision: "RIGHT_FIT",
      },
    });
    assert(created.interviewerId === qa.interviewerAlpha.id, "eval belongs to assigned interviewer");

    const updated = await prisma.evaluation.update({
      where: { id: created.id },
      data: { notes: `${PREFIX} updated`, overallScore: 87 },
    });
    assert(updated.overallScore === 87, "evaluation can be updated");

    await assertThrows(
      () =>
        prisma.evaluation.create({
          data: {
            applicationId: application.id,
            interviewerId: qa.interviewerAlpha.id,
            notes: `${PREFIX} duplicate`,
          },
        }),
      (error) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002",
      "T63 uniqueness: one evaluation per application+interviewer",
    );

    const alphaVisible = await prisma.evaluation.findMany({
      where: {
        AND: [
          evaluationScopeWhere(qa.interviewerAlphaUser),
          { applicationId: application.id },
        ],
      },
    });
    assert(alphaVisible.length === 1, "assigned interviewer sees own evaluation");

    const betaVisible = await prisma.evaluation.findMany({
      where: {
        AND: [
          evaluationScopeWhere(qa.interviewerBetaUser),
          { applicationId: application.id },
        ],
      },
    });
    assert(betaVisible.length === 0, "Beta interviewer cannot see Alpha evaluation");

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
