/**
 * T74 / T72-P1-05: Admin createBillingRecord cannot plant billing without HIRED.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * createBillingRecord / confirmClientCandidateHire require Auth.js request scope.
 *
 * This workflow tests the production validator createBillingRecord calls
 * (assertJobHasHiredApplicationForBilling), the authoritative hire billing
 * generator, plus source scans. It does not replace W08.
 */
import { ApplicationPipelineStatus } from "@prisma/client";

import { generateBillingForHiredApplication } from "../../lib/billing/generate-hire-billing";
import { assertJobHasHiredApplicationForBilling } from "../../lib/validation/billing-validation";
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
import { runWorkflow08 } from "./workflow-08-hiring-billing";

const PREFIX = `${TMP_PREFIX}-W15`;
const HIRED_BILLING_ERROR =
  "Billing can only be created for requirements with a hired candidate.";

async function expectNoBillingRecord(jobId: number, message: string) {
  const count = await prisma.billingRecord.count({ where: { jobId } });
  assert(count === 0, message);
}

export async function runWorkflow15() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W15 billing creation without HIRED");

    const billingActions = source("app/actions/billing-actions.ts");
    const billingValidation = source("lib/validation/billing-validation.ts");
    const hireBilling = source("lib/billing/generate-hire-billing.ts");
    const applicationActions = source("app/actions/application-actions.ts");
    const billingPanel = source("components/billing/BillingRecordsPanel.tsx");
    const billingControls = source(
      "components/billing/BillingAdminStatusControls.tsx",
    );
    const workflow08 = source("scripts/qa/workflow-08-hiring-billing.ts");

    assertIncludes(
      billingActions,
      "await assertJobHasHiredApplicationForBilling(job.id)",
      "createBillingRecord is gated by HIRED before create",
    );
    assertIncludes(
      billingValidation,
      'status: ApplicationPipelineStatus.HIRED',
      "HIRED assert counts Application.status === HIRED",
    );
    assertIncludes(
      hireBilling,
      "export async function generateBillingForHiredApplication",
      "authoritative hire billing generator remains",
    );
    assertIncludes(
      applicationActions,
      "await generateBillingForHiredApplication(tx, application.id)",
      "Client confirm hire still generates billing",
    );
    assertNotIncludes(
      billingPanel,
      "createBillingRecord",
      "billing list UI does not expose createBillingRecord",
    );
    assertNotIncludes(
      billingControls,
      "createBillingRecord",
      "billing status UI does not expose createBillingRecord",
    );
    assertIncludes(
      workflow08,
      "export async function runWorkflow08",
      "TEST F: W08 remains intact",
    );

    const cvPoolJob = await createTmpJob({
      prefix: PREFIX,
      title: "CV Pool Billing Bypass",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    await createTmpApplication({
      prefix: PREFIX,
      jobId: cvPoolJob.id,
      companyId: qa.companyAlpha.id,
      status: ApplicationPipelineStatus.CV_POOL,
      label: "CvPool",
    });
    await assertThrows(
      () => assertJobHasHiredApplicationForBilling(cvPoolJob.id),
      HIRED_BILLING_ERROR,
      "TEST A: createBillingRecord validator rejects CV_POOL job",
    );
    await expectNoBillingRecord(
      cvPoolJob.id,
      "TEST A: no BillingRecord created for CV_POOL",
    );

    const shortlistedJob = await createTmpJob({
      prefix: PREFIX,
      title: "Shortlisted Billing Bypass",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    await createTmpApplication({
      prefix: PREFIX,
      jobId: shortlistedJob.id,
      companyId: qa.companyAlpha.id,
      status: ApplicationPipelineStatus.SHORTLISTED,
      label: "Shortlisted",
    });
    await assertThrows(
      () => assertJobHasHiredApplicationForBilling(shortlistedJob.id),
      HIRED_BILLING_ERROR,
      "TEST B: createBillingRecord validator rejects SHORTLISTED job",
    );
    await expectNoBillingRecord(
      shortlistedJob.id,
      "TEST B: no BillingRecord created for SHORTLISTED",
    );

    const selectedJob = await createTmpJob({
      prefix: PREFIX,
      title: "Selected Billing Bypass",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    await createTmpApplication({
      prefix: PREFIX,
      jobId: selectedJob.id,
      companyId: qa.companyAlpha.id,
      status: ApplicationPipelineStatus.SELECTED,
      label: "Selected",
    });
    await assertThrows(
      () => assertJobHasHiredApplicationForBilling(selectedJob.id),
      HIRED_BILLING_ERROR,
      "TEST C: createBillingRecord validator rejects SELECTED job",
    );
    await expectNoBillingRecord(
      selectedJob.id,
      "TEST C: no BillingRecord created for SELECTED",
    );

    const hired = await prisma.application.findFirst({
      where: {
        status: ApplicationPipelineStatus.HIRED,
        candidate: { name: { startsWith: "V1QA Candidate" } },
      },
      select: {
        id: true,
        jobId: true,
        billingLineItem: {
          select: {
            id: true,
            billingRecordId: true,
            billingRecord: { select: { id: true, jobId: true } },
          },
        },
      },
    });
    assert(hired, "TEST D: V1QA HIRED application exists");
    assert(hired.billingLineItem, "TEST D: BillingLineItem exists");
    assert(hired.billingLineItem?.billingRecord, "TEST D: BillingRecord exists");
    assert(
      hired.billingLineItem?.billingRecord.jobId === hired.jobId,
      "TEST D: BillingRecord belongs to the HIRED job",
    );
    await assertJobHasHiredApplicationForBilling(hired.jobId);

    const recordsBefore = await prisma.billingRecord.count({
      where: { jobId: hired.jobId },
    });
    const lineItemsBefore = await prisma.billingLineItem.count({
      where: { applicationId: hired.id },
    });
    assert(recordsBefore === 1, "TEST D: one BillingRecord for the HIRED job");
    assert(lineItemsBefore === 1, "TEST D: one BillingLineItem for the HIRED application");

    await prisma.$transaction(async (tx) => {
      await generateBillingForHiredApplication(tx, hired.id);
    });
    const recordsAfter = await prisma.billingRecord.count({
      where: { jobId: hired.jobId },
    });
    const lineItemsAfter = await prisma.billingLineItem.count({
      where: { applicationId: hired.id },
    });
    assert(recordsAfter === 1, "TEST E: repeated billing does not duplicate BillingRecord");
    assert(
      lineItemsAfter === 1,
      "TEST E: repeated billing does not duplicate BillingLineItem",
    );

    await cleanupPrefix(PREFIX);

    console.log("W15 TEST F re-running W08");
    await runWorkflow08();
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
