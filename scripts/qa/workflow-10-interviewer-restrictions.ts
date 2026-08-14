import { ApplicationPipelineStatus } from "@prisma/client";

import {
  assertInterviewerJobAccess,
  billingScopeWhere,
  AuthorizationError,
} from "../../lib/auth/authorization";
import { getValidInterviewerPipelineTransitions } from "../../lib/validation/application-pipeline";
import { assert, assertIncludes, assertNotIncludes, assertThrows } from "./assertions";
import { loadV1Qa, source } from "./fixtures";

export async function runWorkflow10() {
  console.log("W10 interviewer hiring restriction");
  const qa = await loadV1Qa();

  const applicationActions = source("app/actions/application-actions.ts");
  const interviewerActions = source("app/actions/interviewer-actions.ts");
  const evaluationActions = source("app/actions/evaluation-actions.ts");
  const billingActions = source("app/actions/billing-actions.ts");
  const shortlistUi = source(
    "components/interviewer/InterviewerShortlistActions.tsx",
  );

  assertIncludes(
    applicationActions,
    "export async function transitionInterviewerApplicationStatus",
    "Interviewer pipeline action exists",
  );
  assertIncludes(
    applicationActions,
    "const interviewer = await requireInterviewerPortal()",
    "Interviewer transition uses portal session",
  );
  assertIncludes(
    applicationActions,
    'assignedInterviewerId: interviewer.interviewerId',
    "ownership from assignedInterviewerId, not caller",
  );
  assertIncludes(
    applicationActions,
    "nextStatus === ApplicationPipelineStatus.SELECTED",
    "Interviewer SELECT explicitly rejected",
  );
  assertIncludes(
    applicationActions,
    "nextStatus === ApplicationPipelineStatus.HIRED",
    "Interviewer HIRE explicitly rejected",
  );

  assert(
    !getValidInterviewerPipelineTransitions("SHORTLISTED").includes("SELECTED"),
    "Interviewer cannot SELECT",
  );
  assert(
    !getValidInterviewerPipelineTransitions("SELECTED").includes("HIRED"),
    "Interviewer cannot HIRE",
  );
  assert(
    getValidInterviewerPipelineTransitions("TECH_EVALUATION").includes(
      ApplicationPipelineStatus.SHORTLISTED,
    ),
    "Interviewer can shortlist from TECH_EVALUATION",
  );

  assertNotIncludes(
    interviewerActions,
    "confirmClientCandidateHire",
    "interviewer CRUD file has no hire",
  );
  assertNotIncludes(interviewerActions, "HIRED", "interviewer CRUD file has no HIRED");
  assertIncludes(
    evaluationActions,
    "Does not accept interviewerId from the browser",
    "evaluation does not trust browser interviewerId",
  );
  assertIncludes(billingActions, "await requireAdmin()", "billing mutations are Admin-only");

  await assertThrows(
    () => billingScopeWhere(qa.interviewerAlphaUser),
    (error) => error instanceof AuthorizationError,
    "Interviewer billingScopeWhere denied",
  );
  await assertThrows(
    () => {
      assertInterviewerJobAccess(qa.interviewerAlphaUser, {
        assignedInterviewerId: qa.interviewerBeta.id,
      });
    },
    (error) => error instanceof AuthorizationError,
    "Alpha interviewer cannot use Beta assignment",
  );

  assertIncludes(shortlistUi, "Add to Shortlist", "UI exposes shortlist");
  assertNotIncludes(shortlistUi, "SELECTED", "UI does not offer SELECT");
  assertNotIncludes(shortlistUi, "HIRED", "UI does not offer HIRE");
}
