/**
 * T77: hiring / lifecycle / billing consistency.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * selectClientCandidate / confirmClientCandidateHire / createBillingRecord
 * require Auth.js request scope.
 *
 * This workflow tests the production validators and predicates those
 * actions call, plus hire billing, plus source scans. It does not
 * replace W07 / W08 / W14 / W15.
 */
import {
  ApplicationPipelineStatus,
  RequirementLifecycle,
} from "@prisma/client";

import { generateBillingForHiredApplication } from "../../lib/billing/generate-hire-billing";
import {
  ADMIN_PIPELINE_TRANSITIONS,
  CLIENT_HIRING_REQUIREMENT_LIFECYCLES,
  getValidAdminPipelineTransitions,
  getValidInterviewerPipelineTransitions,
  jobAllowsClientHiringAction,
} from "../../lib/validation/application-pipeline";
import {
  assertAdminCannotTakeClientHiringDecision,
  assertAdminPipelineTransition,
  assertApplicationCreatedAtCvPool,
  assertJobAllowsClientHire,
  assertJobAllowsClientSelection,
} from "../../lib/validation/application-validation";
import {
  BillingValidationError,
  assertJobHasHiredApplicationForBilling,
  assertJobHasNoActiveBillingRecord,
} from "../../lib/validation/billing-validation";
import { validateJobLifecycleTransition } from "../../lib/validation/job-validation";
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

const PREFIX = `${TMP_PREFIX}-W18`;

const PIPELINE_STATUSES = Object.values(ApplicationPipelineStatus);

const PRE_SOURCING_LIFECYCLES: RequirementLifecycle[] = [
  "REQUIREMENT_DRAFTED",
  "CLIENT_NOTIFIED",
  "REQUIREMENT_POSTED",
  "INTERVIEWER_NOTIFIED",
];

async function clientSelect(params: {
  applicationId: number;
  companyId: number;
}) {
  return prisma.application.updateMany({
    where: {
      id: params.applicationId,
      status: ApplicationPipelineStatus.SHORTLISTED,
      companyId: params.companyId,
      job: {
        companyId: params.companyId,
        requirementLifecycle: {
          in: CLIENT_HIRING_REQUIREMENT_LIFECYCLES,
        },
      },
    },
    data: {
      status: ApplicationPipelineStatus.SELECTED,
    },
  });
}

async function clientHire(params: {
  applicationId: number;
  companyId: number;
}) {
  return prisma.application.updateMany({
    where: {
      id: params.applicationId,
      status: ApplicationPipelineStatus.SELECTED,
      companyId: params.companyId,
      job: {
        companyId: params.companyId,
        requirementLifecycle: {
          in: CLIENT_HIRING_REQUIREMENT_LIFECYCLES,
        },
      },
    },
    data: {
      status: ApplicationPipelineStatus.HIRED,
    },
  });
}

async function hireWithBilling(params: {
  applicationId: number;
  companyId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const updateResult = await tx.application.updateMany({
      where: {
        id: params.applicationId,
        status: ApplicationPipelineStatus.SELECTED,
        companyId: params.companyId,
        job: {
          companyId: params.companyId,
          requirementLifecycle: {
            in: CLIENT_HIRING_REQUIREMENT_LIFECYCLES,
          },
        },
      },
      data: {
        status: ApplicationPipelineStatus.HIRED,
      },
    });
    assert(updateResult.count === 1, "hire transaction moved SELECTED -> HIRED");
    await generateBillingForHiredApplication(tx, params.applicationId);
    return tx.application.findUniqueOrThrow({
      where: { id: params.applicationId },
      include: {
        billingLineItem: {
          include: { billingRecord: true },
        },
      },
    });
  });
}

export async function runWorkflow18() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W18 hiring / lifecycle / billing consistency");

    const applicationActions = source("app/actions/application-actions.ts");
    const applicationValidation = source(
      "lib/validation/application-validation.ts",
    );
    const hireBilling = source("lib/billing/generate-hire-billing.ts");
    const billingActions = source("app/actions/billing-actions.ts");
    const jobValidation = source("lib/validation/job-validation.ts");
    const shortlistUi = source("components/client/ClientShortlistReview.tsx");

    assertIncludes(
      applicationActions,
      "assertJobAllowsClientSelection(application.job.requirementLifecycle)",
      "selectClientCandidate gates requirement lifecycle",
    );
    assertIncludes(
      applicationActions,
      "assertJobAllowsClientHire(application.job.requirementLifecycle)",
      "confirmClientCandidateHire gates requirement lifecycle",
    );
    assertIncludes(
      applicationActions,
      "in: CLIENT_HIRING_REQUIREMENT_LIFECYCLES",
      "Client SELECT/HIRE updateMany includes lifecycle predicate",
    );
    assertIncludes(
      applicationValidation,
      "Candidate can only be selected after sourcing and shortlisting has started.",
      "SELECT lifecycle error is server-side",
    );
    assertIncludes(
      hireBilling,
      "Billing can only be generated after sourcing and shortlisting.",
      "hire billing rejects pre-sourcing lifecycle",
    );
    assertIncludes(
      billingActions,
      "await assertJobHasNoActiveBillingRecord(job.id)",
      "createBillingRecord cannot add a second active record",
    );
    assertIncludes(
      jobValidation,
      'validatedNextLifecycle === "BILLING_GENERATED"',
      "generic lifecycle cannot plant BILLING_GENERATED",
    );
    assertIncludes(
      shortlistUi,
      "jobAllowsClientHiringAction",
      "Client shortlist UI hides Select before sourcing",
    );
    assertIncludes(
      applicationActions,
      "const createStatus = assertApplicationCreatedAtCvPool(status)",
      "createApplication still forces CV_POOL",
    );

    assert(
      assertApplicationCreatedAtCvPool(undefined) ===
        ApplicationPipelineStatus.CV_POOL,
      "create default is CV_POOL",
    );
    await assertThrows(
      () =>
        assertApplicationCreatedAtCvPool(ApplicationPipelineStatus.SHORTLISTED),
      "Applications can only be created in CV Pool.",
      "create cannot plant SHORTLISTED",
    );

    const sourcingJob = await createTmpJob({
      prefix: PREFIX,
      title: "Sourcing Hire",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const { application: selectable } = await createTmpApplication({
      prefix: PREFIX,
      jobId: sourcingJob.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "Selectable",
    });

    assertJobAllowsClientSelection("SOURCING_SHORTLISTING");
    const selectResult = await clientSelect({
      applicationId: selectable.id,
      companyId: qa.companyAlpha.id,
    });
    assert(selectResult.count === 1, "TEST A: valid SHORTLISTED -> SELECTED");
    const selected = await prisma.application.findUniqueOrThrow({
      where: { id: selectable.id },
      include: { billingLineItem: true },
    });
    assert(selected.status === "SELECTED", "TEST A: status is SELECTED");
    assert(!selected.billingLineItem, "TEST A: SELECTED has no billing");

    for (const status of PIPELINE_STATUSES.filter(
      (value) => value !== ApplicationPipelineStatus.SHORTLISTED,
    )) {
      const { application: wrongStatus } = await createTmpApplication({
        prefix: PREFIX,
        jobId: sourcingJob.id,
        companyId: qa.companyAlpha.id,
        status,
        label: `NoSelect-${status}`,
      });
      const attempt = await clientSelect({
        applicationId: wrongStatus.id,
        companyId: qa.companyAlpha.id,
      });
      assert(
        attempt.count === 0,
        `TEST B: ${status} cannot SELECT`,
      );
      const unchanged = await prisma.application.findUniqueOrThrow({
        where: { id: wrongStatus.id },
        select: { status: true },
      });
      assert(
        unchanged.status === status,
        `TEST B: ${status} remains ${status}`,
      );
    }

    assertJobAllowsClientHire("SOURCING_SHORTLISTING");
    const hired = await hireWithBilling({
      applicationId: selectable.id,
      companyId: qa.companyAlpha.id,
    });
    assert(hired.status === "HIRED", "TEST C: valid SELECTED -> HIRED");
    assert(hired.billingLineItem, "TEST C: BillingLineItem created");
    assert(
      hired.billingLineItem?.billingRecord.jobId === sourcingJob.id,
      "TEST C: BillingRecord belongs to the job",
    );
    const lifecycleAfterHire = await prisma.job.findUniqueOrThrow({
      where: { id: sourcingJob.id },
      select: { requirementLifecycle: true },
    });
    assert(
      lifecycleAfterHire.requirementLifecycle === "BILLING_GENERATED",
      "TEST C: job is BILLING_GENERATED",
    );

    for (const status of PIPELINE_STATUSES.filter(
      (value) => value !== ApplicationPipelineStatus.SELECTED,
    )) {
      const { application: wrongHire } = await createTmpApplication({
        prefix: PREFIX,
        jobId: sourcingJob.id,
        companyId: qa.companyAlpha.id,
        status,
        label: `NoHire-${status}`,
      });
      const attempt = await clientHire({
        applicationId: wrongHire.id,
        companyId: qa.companyAlpha.id,
      });
      assert(attempt.count === 0, `TEST D: ${status} cannot HIRE`);
    }

    assert(
      !getValidAdminPipelineTransitions("SHORTLISTED").includes("SELECTED"),
      "TEST E: Admin map cannot SELECT",
    );
    await assertThrows(
      () =>
        assertAdminCannotTakeClientHiringDecision(
          ApplicationPipelineStatus.SELECTED,
          ApplicationPipelineStatus.SHORTLISTED,
        ),
      "Selection must be confirmed by the client who owns this requirement",
      "TEST E: Admin helper rejects SELECT",
    );
    await assertThrows(
      () =>
        assertAdminPipelineTransition(
          ApplicationPipelineStatus.SHORTLISTED,
          ApplicationPipelineStatus.SELECTED,
        ),
      "Selection must be confirmed by the client who owns this requirement",
      "TEST E: Admin CRUD/transition cannot SELECT",
    );

    assert(
      getValidAdminPipelineTransitions("SELECTED").length === 0,
      "TEST F: Admin map cannot HIRE",
    );
    await assertThrows(
      () =>
        assertAdminCannotTakeClientHiringDecision(
          ApplicationPipelineStatus.HIRED,
          ApplicationPipelineStatus.SELECTED,
        ),
      "Hiring must be confirmed by the client who owns this requirement",
      "TEST F: Admin helper rejects HIRE",
    );
    await assertThrows(
      () =>
        assertAdminPipelineTransition(
          ApplicationPipelineStatus.SELECTED,
          ApplicationPipelineStatus.HIRED,
        ),
      "Hiring must be confirmed by the client who owns this requirement",
      "TEST F: Admin CRUD/transition cannot HIRE",
    );
    assert(
      ADMIN_PIPELINE_TRANSITIONS.HIRED.length === 0,
      "TEST F: Admin HIRED is terminal",
    );

    assert(
      !getValidInterviewerPipelineTransitions("SHORTLISTED").includes(
        "SELECTED",
      ),
      "TEST G: Interviewer cannot SELECT",
    );
    assert(
      getValidInterviewerPipelineTransitions("SELECTED").length === 0,
      "TEST H: Interviewer cannot HIRE",
    );
    assertIncludes(
      applicationActions,
      "nextStatus === ApplicationPipelineStatus.SELECTED",
      "TEST G: Interviewer SELECT explicitly rejected",
    );
    assertIncludes(
      applicationActions,
      "nextStatus === ApplicationPipelineStatus.HIRED",
      "TEST H: Interviewer HIRE explicitly rejected",
    );

    for (const next of PIPELINE_STATUSES.filter(
      (value) => value !== ApplicationPipelineStatus.HIRED,
    )) {
      const hiredMessage =
        next === ApplicationPipelineStatus.SELECTED
          ? "Selection must be confirmed by the client who owns this requirement"
          : "Invalid application status transition.";
      await assertThrows(
        () =>
          assertAdminPipelineTransition(ApplicationPipelineStatus.HIRED, next),
        hiredMessage,
        `TEST I: HIRED -> ${next} rejected`,
      );
    }

    for (const next of PIPELINE_STATUSES.filter(
      (value) => value !== ApplicationPipelineStatus.REJECTED,
    )) {
      const message =
        next === ApplicationPipelineStatus.SELECTED
          ? "Selection must be confirmed by the client who owns this requirement"
          : next === ApplicationPipelineStatus.HIRED
            ? "Hiring must be confirmed by the client who owns this requirement"
            : "Invalid application status transition.";
      await assertThrows(
        () =>
          assertAdminPipelineTransition(
            ApplicationPipelineStatus.REJECTED,
            next,
          ),
        message,
        `TEST J: REJECTED -> ${next} rejected`,
      );
    }

    const billingPlantCases: Array<
      [RequirementLifecycle, string]
    > = [
      ["REQUIREMENT_DRAFTED", "Invalid requirement lifecycle transition"],
      ["CLIENT_NOTIFIED", "Invalid requirement lifecycle transition"],
      ["REQUIREMENT_POSTED", "Invalid requirement lifecycle transition"],
      ["INTERVIEWER_NOTIFIED", "Invalid requirement lifecycle transition"],
      ["SOURCING_SHORTLISTING", "Billing workflow is not available yet."],
    ];
    for (const [from, message] of billingPlantCases) {
      await assertThrows(
        () => validateJobLifecycleTransition(from, "BILLING_GENERATED"),
        message,
        `TEST K: ${from} cannot plant BILLING_GENERATED`,
      );
    }

    const billingStatusJob = await createTmpJob({
      prefix: PREFIX,
      title: "Billing Status Gate",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    for (const status of PIPELINE_STATUSES.filter(
      (value) => value !== ApplicationPipelineStatus.HIRED,
    )) {
      const { application: unhired } = await createTmpApplication({
        prefix: PREFIX,
        jobId: billingStatusJob.id,
        companyId: qa.companyAlpha.id,
        status,
        label: `NoBill-${status}`,
      });
      let rejected = false;
      try {
        await prisma.$transaction(async (tx) => {
          await generateBillingForHiredApplication(tx, unhired.id);
        });
      } catch (error) {
        rejected =
          error instanceof BillingValidationError &&
          error.message.includes("hired candidates");
      }
      assert(rejected, `TEST L: ${status} cannot generate billing`);
    }
    await assertThrows(
      () => assertJobHasHiredApplicationForBilling(billingStatusJob.id),
      "Billing can only be created for requirements with a hired candidate.",
      "TEST L: createBillingRecord still requires HIRED",
    );

    await prisma.$transaction(async (tx) => {
      await generateBillingForHiredApplication(tx, selectable.id);
    });
    assert(
      (await prisma.billingRecord.count({ where: { jobId: sourcingJob.id } })) ===
        1,
      "TEST M: repeated billing does not duplicate BillingRecord",
    );
    assert(
      (await prisma.billingLineItem.count({
        where: { applicationId: selectable.id },
      })) === 1,
      "TEST M: repeated billing does not duplicate BillingLineItem",
    );
    await assertThrows(
      () => assertJobHasNoActiveBillingRecord(sourcingJob.id),
      "Billing record already exists.",
      "TEST M: createBillingRecord cannot add a second active record",
    );

    const concurrentHireJob = await createTmpJob({
      prefix: PREFIX,
      title: "Concurrent Hire",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const { application: concurrentSelected } = await createTmpApplication({
      prefix: PREFIX,
      jobId: concurrentHireJob.id,
      companyId: qa.companyAlpha.id,
      status: "SELECTED",
      label: "ConcurrentHire",
    });
    const [hireOne, hireTwo] = await Promise.all([
      clientHire({
        applicationId: concurrentSelected.id,
        companyId: qa.companyAlpha.id,
      }),
      clientHire({
        applicationId: concurrentSelected.id,
        companyId: qa.companyAlpha.id,
      }),
    ]);
    assert(
      hireOne.count + hireTwo.count === 1,
      "TEST N: concurrent HIRE of the same application has one winner",
    );
    const concurrentWinner = await prisma.application.findUniqueOrThrow({
      where: { id: concurrentSelected.id },
      select: { status: true },
    });
    assert(concurrentWinner.status === "HIRED", "TEST N: winner is HIRED");

    const { application: secondSelected } = await createTmpApplication({
      prefix: PREFIX,
      jobId: concurrentHireJob.id,
      companyId: qa.companyAlpha.id,
      status: "SELECTED",
      label: "SecondHire",
    });
    await Promise.all([
      prisma.$transaction(async (tx) => {
        await generateBillingForHiredApplication(tx, concurrentSelected.id);
      }),
      hireWithBilling({
        applicationId: secondSelected.id,
        companyId: qa.companyAlpha.id,
      }),
    ]);
    assert(
      (await prisma.billingRecord.count({
        where: { jobId: concurrentHireJob.id },
      })) === 1,
      "TEST N: two HIRED applications share one BillingRecord",
    );
    assert(
      (await prisma.billingLineItem.count({
        where: {
          application: { jobId: concurrentHireJob.id },
        },
      })) === 2,
      "TEST N: each HIRED application has a line item",
    );

    const concurrentSelectJob = await createTmpJob({
      prefix: PREFIX,
      title: "Concurrent Select",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const { application: concurrentShortlisted } = await createTmpApplication({
      prefix: PREFIX,
      jobId: concurrentSelectJob.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "ConcurrentSelect",
    });
    const [selectOne, selectTwo] = await Promise.all([
      clientSelect({
        applicationId: concurrentShortlisted.id,
        companyId: qa.companyAlpha.id,
      }),
      clientSelect({
        applicationId: concurrentShortlisted.id,
        companyId: qa.companyAlpha.id,
      }),
    ]);
    assert(
      selectOne.count + selectTwo.count === 1,
      "TEST O: concurrent SELECT of the same application has one winner",
    );

    const betaAttempt = await clientSelect({
      applicationId: concurrentShortlisted.id,
      companyId: qa.companyBeta.id,
    });
    assert(betaAttempt.count === 0, "TEST P: Beta cannot SELECT Alpha candidate");
    const alphaSelected = await prisma.application.findUniqueOrThrow({
      where: { id: concurrentShortlisted.id },
      select: { status: true, companyId: true },
    });
    assert(alphaSelected.status === "SELECTED", "TEST P: Alpha SELECT stands");
    assert(
      alphaSelected.companyId === qa.companyAlpha.id,
      "TEST P: companyId was not redirected",
    );

    const betaHireAttempt = await clientHire({
      applicationId: concurrentShortlisted.id,
      companyId: qa.companyBeta.id,
    });
    assert(betaHireAttempt.count === 0, "TEST P: Beta cannot HIRE Alpha candidate");

    for (const lifecycle of PRE_SOURCING_LIFECYCLES) {
      await assertThrows(
        () => assertJobAllowsClientSelection(lifecycle),
        "Candidate can only be selected after sourcing and shortlisting has started.",
        `TEST Q: SELECT rejected at ${lifecycle}`,
      );
      await assertThrows(
        () => assertJobAllowsClientHire(lifecycle),
        "Hire can only be confirmed after sourcing and shortlisting has started.",
        `TEST Q: HIRE rejected at ${lifecycle}`,
      );
      assert(
        !jobAllowsClientHiringAction(lifecycle),
        `TEST Q: ${lifecycle} is not a client hiring lifecycle`,
      );

      const earlyJob = await createTmpJob({
        prefix: PREFIX,
        title: `Early ${lifecycle}`,
        companyId: qa.companyAlpha.id,
        assignedInterviewerId: qa.interviewerAlpha.id,
        requirementLifecycle: lifecycle,
      });
      const { application: earlyShortlisted } = await createTmpApplication({
        prefix: PREFIX,
        jobId: earlyJob.id,
        companyId: qa.companyAlpha.id,
        status: "SHORTLISTED",
        label: `EarlySelect-${lifecycle}`,
      });
      const earlySelect = await clientSelect({
        applicationId: earlyShortlisted.id,
        companyId: qa.companyAlpha.id,
      });
      assert(
        earlySelect.count === 0,
        `TEST Q: updateMany cannot SELECT at ${lifecycle}`,
      );

      const { application: earlySelected } = await createTmpApplication({
        prefix: PREFIX,
        jobId: earlyJob.id,
        companyId: qa.companyAlpha.id,
        status: "SELECTED",
        label: `EarlyHire-${lifecycle}`,
      });
      const earlyHire = await clientHire({
        applicationId: earlySelected.id,
        companyId: qa.companyAlpha.id,
      });
      assert(
        earlyHire.count === 0,
        `TEST Q: updateMany cannot HIRE at ${lifecycle}`,
      );

      const { application: plantedHired } = await createTmpApplication({
        prefix: PREFIX,
        jobId: earlyJob.id,
        companyId: qa.companyAlpha.id,
        status: "HIRED",
        label: `PlantedHired-${lifecycle}`,
      });
      let billingRejected = false;
      try {
        await prisma.$transaction(async (tx) => {
          await generateBillingForHiredApplication(tx, plantedHired.id);
        });
      } catch (error) {
        billingRejected =
          error instanceof BillingValidationError &&
          error.message.includes("sourcing and shortlisting");
      }
      assert(
        billingRejected,
        `TEST R: HIRED on ${lifecycle} cannot generate billing`,
      );
      assert(
        (await prisma.billingRecord.count({ where: { jobId: earlyJob.id } })) ===
          0,
        `TEST R: no BillingRecord planted at ${lifecycle}`,
      );
      const earlyJobAfter = await prisma.job.findUniqueOrThrow({
        where: { id: earlyJob.id },
        select: { requirementLifecycle: true },
      });
      assert(
        earlyJobAfter.requirementLifecycle === lifecycle,
        `TEST R: ${lifecycle} was not jumped to BILLING_GENERATED`,
      );
    }

    const t70NotRequired = await createTmpJob({
      prefix: PREFIX,
      title: "No T70 Gate",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });
    const { application: withoutT70 } = await createTmpApplication({
      prefix: PREFIX,
      jobId: t70NotRequired.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "NoT70",
    });
    const selectWithoutT70 = await clientSelect({
      applicationId: withoutT70.id,
      companyId: qa.companyAlpha.id,
    });
    assert(
      selectWithoutT70.count === 1,
      "TEST Q: T70 shortlistingCompletedAt is not a SELECT gate",
    );

    const additionalSelect = await createTmpApplication({
      prefix: PREFIX,
      jobId: sourcingJob.id,
      companyId: qa.companyAlpha.id,
      status: "SHORTLISTED",
      label: "AfterBilling",
    });
    assertJobAllowsClientSelection("BILLING_GENERATED");
    const selectAfterBilling = await clientSelect({
      applicationId: additionalSelect.application.id,
      companyId: qa.companyAlpha.id,
    });
    assert(
      selectAfterBilling.count === 1,
      "TEST Q: additional SELECT remains allowed after BILLING_GENERATED",
    );

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
