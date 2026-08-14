import { generateBillingForHiredApplication } from "../../lib/billing/generate-hire-billing";
import { BillingValidationError } from "../../lib/validation/billing-validation";
import { assert, assertIncludes } from "./assertions";
import {
  cleanupPrefix,
  createTmpApplication,
  createTmpJob,
  loadV1Qa,
  prisma,
  source,
  TMP_PREFIX,
} from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W08`;

export async function runWorkflow08() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W08 client hiring + billing");

    const applicationActions = source("app/actions/application-actions.ts");
    assertIncludes(
      applicationActions,
      "export async function confirmClientCandidateHire",
      "Client hire action exists",
    );
    assertIncludes(
      applicationActions,
      "await generateBillingForHiredApplication(tx, application.id)",
      "hire generates billing in the same transaction",
    );

    const job = await createTmpJob({
      prefix: PREFIX,
      title: "Hire Billing",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const { application } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: "SELECTED",
      label: "ToHire",
    });

    const hire = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.application.updateMany({
        where: {
          id: application.id,
          status: "SELECTED",
          companyId: qa.companyAlpha.id,
          job: { companyId: qa.companyAlpha.id },
        },
        data: { status: "HIRED" },
      });
      assert(updateResult.count === 1, "SELECTED -> HIRED");
      await generateBillingForHiredApplication(tx, application.id);
      return tx.application.findUniqueOrThrow({
        where: { id: application.id },
        include: {
          billingLineItem: { include: { billingRecord: true } },
        },
      });
    });

    assert(hire.status === "HIRED", "status HIRED");
    assert(hire.billingLineItem, "exactly one line item after hire");
    assert(
      hire.billingLineItem?.billingRecord.jobId === job.id,
      "billing record belongs to the requirement",
    );
    assert(
      hire.billingLineItem?.billingRecord.companyId === qa.companyAlpha.id,
      "billing record belongs to Alpha",
    );

    const lineItems = await prisma.billingLineItem.count({
      where: { applicationId: application.id },
    });
    assert(lineItems === 1, "one line item");

    await prisma.$transaction(async (tx) => {
      await generateBillingForHiredApplication(tx, application.id);
    });
    assert(
      (await prisma.billingLineItem.count({
        where: { applicationId: application.id },
      })) === 1,
      "repeat billing is idempotent",
    );
    assert(
      (await prisma.billingRecord.count({ where: { jobId: job.id } })) === 1,
      "repeat hire does not duplicate billing records",
    );

    const jobAfter = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      select: { requirementLifecycle: true },
    });
    assert(
      jobAfter.requirementLifecycle === "BILLING_GENERATED",
      "job lifecycle BILLING_GENERATED",
    );

    const { application: selectedOnly } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: "SELECTED",
      label: "StaySelected",
    });
    let selectedRejected = false;
    try {
      await prisma.$transaction(async (tx) => {
        await generateBillingForHiredApplication(tx, selectedOnly.id);
      });
    } catch (error) {
      selectedRejected =
        error instanceof BillingValidationError &&
        error.message.includes("hired candidates");
    }
    assert(selectedRejected, "SELECTED still cannot bill");

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
