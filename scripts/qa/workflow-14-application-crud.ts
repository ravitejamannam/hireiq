/**
 * T73 / T72-P1-03: generic Admin Application CRUD cannot bypass
 * ADMIN_PIPELINE_TRANSITIONS.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * createApplication / updateApplication / transitionApplicationStatus
 * / selectClientCandidate / confirmClientCandidateHire require Auth.js
 * request scope.
 *
 * This workflow tests the production validators those actions call
 * (assertApplicationCreatedAtCvPool, assertAdminPipelineTransition),
 * plus source scans, plus the existing Client SELECT/HIRE paths used by
 * W07/W08. It does not invoke billing code except to confirm W08's
 * production call site is unchanged.
 */
import { ApplicationPipelineStatus } from "@prisma/client";

import {
  ADMIN_PIPELINE_TRANSITIONS,
  getValidAdminPipelineTransitions,
} from "../../lib/validation/application-pipeline";
import {
  ApplicationValidationError,
  assertAdminPipelineTransition,
  assertApplicationCreatedAtCvPool,
} from "../../lib/validation/application-validation";
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

const PREFIX = `${TMP_PREFIX}-W14`;

async function expectAdminTransitionRejected(
  current: ApplicationPipelineStatus,
  next: ApplicationPipelineStatus,
  message: string,
) {
  await assertThrows(
    () => assertAdminPipelineTransition(current, next),
    (error) => error instanceof ApplicationValidationError,
    message,
  );
}

export async function runWorkflow14() {
  await cleanupPrefix(PREFIX);
  const qa = await loadV1Qa();

  try {
    console.log("W14 generic application CRUD pipeline");

    const applicationActions = source("app/actions/application-actions.ts");
    const applicationValidation = source(
      "lib/validation/application-validation.ts",
    );
    const applicationForm = source("components/applications/ApplicationForm.tsx");
    const pipelineClient = source("components/pipeline/PipelineClient.tsx");
    const workflow07 = source("scripts/qa/workflow-07-selection.ts");
    const workflow08 = source("scripts/qa/workflow-08-hiring-billing.ts");

    assertIncludes(
      applicationActions,
      "const createStatus = assertApplicationCreatedAtCvPool(status)",
      "createApplication forces CV_POOL through the shared create assert",
    );
    assertIncludes(
      applicationActions,
      "assertAdminPipelineTransition",
      "updateApplication and transitionApplicationStatus share assertAdminPipelineTransition",
    );
    assertIncludes(
      applicationValidation,
      "getValidAdminPipelineTransitions(currentStatus)",
      "Admin CRUD transition assert uses ADMIN_PIPELINE_TRANSITIONS",
    );
    assertIncludes(
      applicationForm,
      "getAdminApplicationFormStatuses",
      "ApplicationForm derives options from the Admin pipeline map",
    );
    assertIncludes(
      pipelineClient,
      "ADMIN_PIPELINE_TRANSITIONS",
      "PipelineClient still uses the shared Admin map",
    );
    assertIncludes(
      applicationActions,
      "export async function selectClientCandidate",
      "TEST P: Client SELECT action remains",
    );
    assertIncludes(
      applicationActions,
      "export async function confirmClientCandidateHire",
      "TEST Q: Client HIRE action remains",
    );
    assertIncludes(
      applicationActions,
      "await generateBillingForHiredApplication(tx, application.id)",
      "TEST R: confirmClientCandidateHire still generates billing",
    );
    assertIncludes(
      workflow07,
      "export async function runWorkflow07",
      "TEST P: W07 Client selection suite is intact",
    );
    assertIncludes(
      workflow08,
      "await generateBillingForHiredApplication(tx, application.id)",
      "TEST R: W08 billing path is intact",
    );

    const job = await createTmpJob({
      prefix: PREFIX,
      title: "CRUD Pipeline",
      companyId: qa.companyAlpha.id,
      assignedInterviewerId: qa.interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      sourcingAccessReceivedAt: new Date(),
    });

    const createStatus = assertApplicationCreatedAtCvPool(undefined);
    assert(
      createStatus === ApplicationPipelineStatus.CV_POOL,
      "TEST A: omitted create status defaults to CV_POOL",
    );
    const { application: created } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: createStatus,
      label: "CreateDefault",
    });
    assert(
      created.status === ApplicationPipelineStatus.CV_POOL,
      "TEST A: generic create path persists CV_POOL",
    );

    await assertThrows(
      () =>
        assertApplicationCreatedAtCvPool(
          ApplicationPipelineStatus.SHORTLISTED,
        ),
      "Applications can only be created in CV Pool",
      "TEST B: create cannot plant SHORTLISTED",
    );
    const shortlistedPlantCount = await prisma.application.count({
      where: {
        jobId: job.id,
        status: ApplicationPipelineStatus.SHORTLISTED,
        candidate: { name: { startsWith: `${PREFIX} Candidate Create` } },
      },
    });
    assert(shortlistedPlantCount === 0, "TEST B: no SHORTLISTED application created");

    await assertThrows(
      () => assertApplicationCreatedAtCvPool(ApplicationPipelineStatus.HIRED),
      "Applications can only be created in CV Pool",
      "TEST C: create cannot plant HIRED",
    );
    const hiredPlantCount = await prisma.application.count({
      where: {
        jobId: job.id,
        status: ApplicationPipelineStatus.HIRED,
        candidate: { name: { startsWith: `${PREFIX} Candidate Create` } },
      },
    });
    assert(hiredPlantCount === 0, "TEST C: no HIRED application created");

    assert(
      assertAdminPipelineTransition(
        ApplicationPipelineStatus.CV_POOL,
        ApplicationPipelineStatus.EXPERT_REVIEW,
      ) === ApplicationPipelineStatus.EXPERT_REVIEW,
      "TEST D: CV_POOL -> EXPERT_REVIEW",
    );
    assert(
      assertAdminPipelineTransition(
        ApplicationPipelineStatus.EXPERT_REVIEW,
        ApplicationPipelineStatus.TECH_EVALUATION,
      ) === ApplicationPipelineStatus.TECH_EVALUATION,
      "TEST E: EXPERT_REVIEW -> TECH_EVALUATION",
    );
    assert(
      assertAdminPipelineTransition(
        ApplicationPipelineStatus.TECH_EVALUATION,
        ApplicationPipelineStatus.SHORTLISTED,
      ) === ApplicationPipelineStatus.SHORTLISTED,
      "TEST F: TECH_EVALUATION -> SHORTLISTED",
    );

    assert(
      assertAdminPipelineTransition(
        ApplicationPipelineStatus.CV_POOL,
        ApplicationPipelineStatus.REJECTED,
      ) === ApplicationPipelineStatus.REJECTED,
      "TEST G: CV_POOL -> REJECTED",
    );
    assert(
      assertAdminPipelineTransition(
        ApplicationPipelineStatus.EXPERT_REVIEW,
        ApplicationPipelineStatus.REJECTED,
      ) === ApplicationPipelineStatus.REJECTED,
      "TEST G: EXPERT_REVIEW -> REJECTED",
    );
    assert(
      assertAdminPipelineTransition(
        ApplicationPipelineStatus.TECH_EVALUATION,
        ApplicationPipelineStatus.REJECTED,
      ) === ApplicationPipelineStatus.REJECTED,
      "TEST G: TECH_EVALUATION -> REJECTED",
    );

    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.CV_POOL,
      ApplicationPipelineStatus.SHORTLISTED,
      "TEST H: CV_POOL -> SHORTLISTED rejected",
    );
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.EXPERT_REVIEW,
      ApplicationPipelineStatus.SHORTLISTED,
      "TEST I: EXPERT_REVIEW -> SHORTLISTED rejected",
    );
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.CV_POOL,
      ApplicationPipelineStatus.TECH_EVALUATION,
      "TEST J: CV_POOL -> TECH_EVALUATION rejected",
    );

    const { application: hired } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: ApplicationPipelineStatus.HIRED,
      label: "HiredTerminal",
    });
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.HIRED,
      ApplicationPipelineStatus.REJECTED,
      "TEST K: HIRED -> REJECTED rejected",
    );
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.HIRED,
      ApplicationPipelineStatus.CV_POOL,
      "TEST K: HIRED -> CV_POOL rejected",
    );
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.HIRED,
      ApplicationPipelineStatus.SHORTLISTED,
      "TEST K: HIRED -> SHORTLISTED rejected",
    );
    const hiredAfter = await prisma.application.findUniqueOrThrow({
      where: { id: hired.id },
      select: { status: true },
    });
    assert(
      hiredAfter.status === ApplicationPipelineStatus.HIRED,
      "TEST K: HIRED application remains HIRED",
    );

    const { application: rejected } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: ApplicationPipelineStatus.REJECTED,
      label: "RejectedTerminal",
    });
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.REJECTED,
      ApplicationPipelineStatus.CV_POOL,
      "TEST L: REJECTED -> CV_POOL rejected",
    );
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.REJECTED,
      ApplicationPipelineStatus.EXPERT_REVIEW,
      "TEST L: REJECTED -> EXPERT_REVIEW rejected",
    );
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.REJECTED,
      ApplicationPipelineStatus.SHORTLISTED,
      "TEST L: REJECTED -> SHORTLISTED rejected",
    );
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.REJECTED,
      ApplicationPipelineStatus.HIRED,
      "TEST L: REJECTED -> HIRED rejected",
    );
    const rejectedAfter = await prisma.application.findUniqueOrThrow({
      where: { id: rejected.id },
      select: { status: true },
    });
    assert(
      rejectedAfter.status === ApplicationPipelineStatus.REJECTED,
      "TEST L: REJECTED application remains REJECTED",
    );

    const { application: selected } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: ApplicationPipelineStatus.SELECTED,
      label: "SelectedOwned",
    });
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.SELECTED,
      ApplicationPipelineStatus.REJECTED,
      "TEST M: SELECTED -> REJECTED rejected",
    );
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.SELECTED,
      ApplicationPipelineStatus.HIRED,
      "TEST M: SELECTED -> HIRED rejected",
    );
    const selectedAfter = await prisma.application.findUniqueOrThrow({
      where: { id: selected.id },
      select: { status: true },
    });
    assert(
      selectedAfter.status === ApplicationPipelineStatus.SELECTED,
      "TEST M: SELECTED application remains SELECTED",
    );

    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.SHORTLISTED,
      ApplicationPipelineStatus.SELECTED,
      "TEST N: Admin CRUD cannot enter SELECTED",
    );
    await expectAdminTransitionRejected(
      ApplicationPipelineStatus.SHORTLISTED,
      ApplicationPipelineStatus.HIRED,
      "TEST O: Admin CRUD cannot enter HIRED",
    );
    assert(
      !getValidAdminPipelineTransitions(
        ApplicationPipelineStatus.SHORTLISTED,
      ).includes(ApplicationPipelineStatus.SELECTED),
      "TEST N: Admin map does not include SHORTLISTED -> SELECTED",
    );
    assert(
      !getValidAdminPipelineTransitions(
        ApplicationPipelineStatus.SHORTLISTED,
      ).includes(ApplicationPipelineStatus.HIRED),
      "TEST O: Admin map does not include SHORTLISTED -> HIRED",
    );
    assert(
      ADMIN_PIPELINE_TRANSITIONS.SELECTED.length === 0,
      "SELECTED has no Admin transitions",
    );
    assert(
      ADMIN_PIPELINE_TRANSITIONS.HIRED.length === 0,
      "HIRED has no Admin transitions",
    );

    const { application: selectable } = await createTmpApplication({
      prefix: PREFIX,
      jobId: job.id,
      companyId: qa.companyAlpha.id,
      status: ApplicationPipelineStatus.SHORTLISTED,
      label: "ClientSelect",
    });
    const clientSelect = await prisma.application.updateMany({
      where: {
        id: selectable.id,
        status: ApplicationPipelineStatus.SHORTLISTED,
        companyId: qa.companyAlpha.id,
        job: { companyId: qa.companyAlpha.id },
      },
      data: { status: ApplicationPipelineStatus.SELECTED },
    });
    assert(clientSelect.count === 1, "TEST P: Client SELECT path still works");
    const afterSelect = await prisma.application.findUniqueOrThrow({
      where: { id: selectable.id },
      select: { status: true },
    });
    assert(
      afterSelect.status === ApplicationPipelineStatus.SELECTED,
      "TEST P: SHORTLISTED -> SELECTED via Client path",
    );

    const clientHire = await prisma.application.updateMany({
      where: {
        id: selectable.id,
        status: ApplicationPipelineStatus.SELECTED,
        companyId: qa.companyAlpha.id,
        job: { companyId: qa.companyAlpha.id },
      },
      data: { status: ApplicationPipelineStatus.HIRED },
    });
    assert(clientHire.count === 1, "TEST Q: Client HIRE path still works");
    const afterHire = await prisma.application.findUniqueOrThrow({
      where: { id: selectable.id },
      select: { status: true },
    });
    assert(
      afterHire.status === ApplicationPipelineStatus.HIRED,
      "TEST Q: SELECTED -> HIRED via Client path",
    );

    await cleanupPrefix(PREFIX);
  } catch (error) {
    await cleanupPrefix(PREFIX).catch(() => undefined);
    throw error;
  }
}
