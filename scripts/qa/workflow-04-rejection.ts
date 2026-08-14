import { ApplicationPipelineStatus } from "@prisma/client";

import {
  getValidAdminPipelineTransitions,
  getValidInterviewerPipelineTransitions,
} from "../../lib/validation/application-pipeline";
import { assertAdminCannotTakeClientHiringDecision } from "../../lib/validation/application-validation";
import { assert, assertThrows } from "./assertions";
import {
  cleanupPrefix,
  createTmpApplication,
  createTmpJob,
  loadV1Qa,
  prisma,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W04`;

export async function runWorkflow04() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W04 interviewer/admin rejection");

    assert(
      getValidAdminPipelineTransitions("EXPERT_REVIEW").includes("REJECTED"),
      "Admin may EXPERT_REVIEW -> REJECTED",
    );
    assert(
      getValidAdminPipelineTransitions("TECH_EVALUATION").includes("REJECTED"),
      "Admin may TECH_EVALUATION -> REJECTED",
    );
    assert(
      !getValidInterviewerPipelineTransitions("EXPERT_REVIEW").includes(
        "REJECTED",
      ),
      "Interviewer cannot reject from EXPERT_REVIEW (not in interviewer map)",
    );
    assert(
      getValidInterviewerPipelineTransitions("TECH_EVALUATION").includes(
        "REJECTED",
      ),
      "Interviewer may TECH_EVALUATION -> REJECTED",
    );
    assert(
      getValidInterviewerPipelineTransitions("REJECTED").length === 0,
      "REJECTED is terminal for interviewer",
    );
    assert(
      getValidAdminPipelineTransitions("REJECTED").length === 0,
      "REJECTED is terminal for Admin",
    );

    await assertThrows(
      () =>
        assertAdminCannotTakeClientHiringDecision(
          ApplicationPipelineStatus.SELECTED,
          ApplicationPipelineStatus.REJECTED,
        ),
      "Selection must be confirmed by the client who owns this requirement",
      "Admin cannot SELECT a rejected candidate",
    );
    await assertThrows(
      () =>
        assertAdminCannotTakeClientHiringDecision(
          ApplicationPipelineStatus.HIRED,
          ApplicationPipelineStatus.REJECTED,
        ),
      "Hiring must be confirmed by the client who owns this requirement",
      "Admin cannot HIRE a rejected candidate",
    );

    const job = await createTmpJob({
      prefix: PREFIX,
      title: "Rejection",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const { application } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: "REJECTED",
      label: "Rejected",
    });

    const selectAttempt = await prisma.application.updateMany({
      where: {
        id: application.id,
        status: "SHORTLISTED",
        companyId: qa.companyAlpha.id,
        job: { companyId: qa.companyAlpha.id },
      },
      data: { status: "SELECTED" },
    });
    assert(selectAttempt.count === 0, "rejected candidate cannot be selected");

    const hireAttempt = await prisma.application.updateMany({
      where: {
        id: application.id,
        status: "SELECTED",
        companyId: qa.companyAlpha.id,
      },
      data: { status: "HIRED" },
    });
    assert(hireAttempt.count === 0, "rejected candidate cannot be hired");

    const current = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
      select: { status: true, billingLineItem: true },
    });
    assert(current.status === "REJECTED", "status remains REJECTED");
    assert(!current.billingLineItem, "rejected candidate has no billing");

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
