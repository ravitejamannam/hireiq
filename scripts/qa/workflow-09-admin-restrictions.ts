import { ApplicationPipelineStatus } from "@prisma/client";

import { ADMIN_PIPELINE_TRANSITIONS } from "../../lib/validation/application-pipeline";
import { getValidAdminPipelineTransitions } from "../../lib/validation/application-pipeline";
import { assertAdminCannotTakeClientHiringDecision } from "../../lib/validation/application-validation";
import { assert, assertIncludes, assertThrows } from "./assertions";
import { source } from "./fixtures";

export async function runWorkflow09() {
  console.log("W09 admin hiring restriction");

  const applicationActions = source("app/actions/application-actions.ts");
  const pipelineClient = source("components/pipeline/PipelineClient.tsx");
  const applicationForm = source("components/applications/ApplicationForm.tsx");
  const adminNotes = source("components/applications/admin-hiring-notes.ts");

  assertIncludes(
    applicationActions,
    "await requireAdmin()",
    "Admin transition action is Admin-gated",
  );
  assertIncludes(
    applicationActions,
    "Selection must be confirmed by the client who owns this requirement",
    "Admin SELECT rejected server-side",
  );
  assertIncludes(
    applicationActions,
    "Hiring must be confirmed by the client who owns this requirement",
    "Admin HIRE rejected server-side",
  );
  assertIncludes(
    applicationActions,
    "export async function selectClientCandidate",
    "SELECT lives on Client action",
  );
  assertIncludes(
    applicationActions,
    "export async function confirmClientCandidateHire",
    "HIRE lives on Client action",
  );

  assert(
    !getValidAdminPipelineTransitions("SHORTLISTED").includes("SELECTED"),
    "Admin map: SHORTLISTED cannot SELECT",
  );
  assert(
    getValidAdminPipelineTransitions("SELECTED").length === 0,
    "Admin map: SELECTED has no transitions",
  );
  assert(
    ADMIN_PIPELINE_TRANSITIONS.HIRED.length === 0,
    "Admin map: HIRED is terminal",
  );

  await assertThrows(
    () =>
      assertAdminCannotTakeClientHiringDecision(
        ApplicationPipelineStatus.SELECTED,
        ApplicationPipelineStatus.SHORTLISTED,
      ),
    "Selection must be confirmed by the client",
    "direct helper rejects Admin SELECT",
  );
  await assertThrows(
    () =>
      assertAdminCannotTakeClientHiringDecision(
        ApplicationPipelineStatus.HIRED,
        ApplicationPipelineStatus.SELECTED,
      ),
    "Hiring must be confirmed by the client",
    "direct helper rejects Admin HIRE",
  );

  assertIncludes(
    pipelineClient,
    "ADMIN_PIPELINE_TRANSITIONS",
    "Admin pipeline UI uses shared Admin map (no SELECT)",
  );
  assertIncludes(
    adminNotes,
    "Client selects from the Client portal",
    "Admin UI copy does not offer Select",
  );
  assertIncludes(
    applicationForm,
    "option.value === ApplicationPipelineStatus.SELECTED",
    "Admin application form hides SELECTED unless already SELECTED",
  );
}
