import { ApplicationPipelineStatus } from "@prisma/client";

import { generateBillingForHiredApplication } from "../../lib/billing/generate-hire-billing";
import {
  getValidAdminPipelineTransitions,
  getValidInterviewerPipelineTransitions,
} from "../../lib/validation/application-pipeline";
import { assertAdminCannotTakeClientHiringDecision } from "../../lib/validation/application-validation";
import { BillingValidationError } from "../../lib/validation/billing-validation";
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

const PREFIX = `${TMP_PREFIX}-W07`;

export async function runWorkflow07() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W07 client selection");

    const applicationActions = source("app/actions/application-actions.ts");
    assertIncludes(
      applicationActions,
      "export async function selectClientCandidate",
      "Client select action exists",
    );
    assertIncludes(
      applicationActions,
      "const client = await requireClientPortal()",
      "select is Client-portal gated",
    );
    assert(
      !getValidAdminPipelineTransitions("SHORTLISTED").includes("SELECTED"),
      "Admin pipeline cannot SELECT",
    );
    assert(
      !getValidInterviewerPipelineTransitions("SHORTLISTED").includes(
        "SELECTED",
      ),
      "Interviewer pipeline cannot SELECT",
    );
    await assertThrows(
      () =>
        assertAdminCannotTakeClientHiringDecision(
          ApplicationPipelineStatus.SELECTED,
          ApplicationPipelineStatus.SHORTLISTED,
        ),
      "Selection must be confirmed by the client who owns this requirement",
      "Admin helper rejects SELECT",
    );

    const job = await createTmpJob({
      prefix: PREFIX,
      title: "Selection",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const { application } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "Selectable",
    });

    const betaAttempt = await prisma.application.updateMany({
      where: {
        id: application.id,
        status: "SHORTLISTED",
        companyId: qa.companyBeta.id,
        job: { companyId: qa.companyBeta.id },
      },
      data: { status: "SELECTED" },
    });
    assert(betaAttempt.count === 0, "Beta company filter cannot select Alpha candidate");

    const alphaSelect = await prisma.application.updateMany({
      where: {
        id: application.id,
        status: "SHORTLISTED",
        companyId: qa.companyAlpha.id,
        job: { companyId: qa.companyAlpha.id },
      },
      data: { status: "SELECTED" },
    });
    assert(alphaSelect.count === 1, "owning Client company can SELECT");

    const selected = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
      include: { billingLineItem: true },
    });
    assert(selected.status === "SELECTED", "status is SELECTED");
    assert(!selected.billingLineItem, "SELECTED has no billing line item");

    let selectedBillingRejected = false;
    try {
      await prisma.$transaction(async (tx) => {
        await generateBillingForHiredApplication(tx, application.id);
      });
    } catch (error) {
      selectedBillingRejected =
        error instanceof BillingValidationError &&
        error.message.includes("hired candidates");
    }
    assert(selectedBillingRejected, "billing generator rejects SELECTED");

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
