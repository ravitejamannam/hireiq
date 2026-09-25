import { PortalRole } from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import {
  EVIDENCE_GRAPH_IN_PROGRESS,
  EVIDENCE_GRAPH_TENANT_MISMATCH,
  EvidenceGraphError,
} from "@/lib/evidence-graph/evidence-graph-errors";
import {
  executeMaterializeEvidenceGraph,
  loadEvidenceGraphPage,
} from "@/lib/evidence-graph/evidence-graph-operations";
import type { EvidenceGraphPageData } from "@/lib/evidence-graph/evidence-graph-types";
import {
  EvidenceGraphValidationError,
  isAdminEvidenceGraphRole,
  rejectForbiddenEvidenceGraphFields,
  validateEvidenceGraphJobId,
  validateEvidenceGraphSpecificationId,
} from "@/lib/validation/evidence-graph-validation";

export { executeMaterializeEvidenceGraph } from "@/lib/evidence-graph/evidence-graph-operations";

export function assertCanManageEvidenceGraph(role: PortalRole) {
  if (!isAdminEvidenceGraphRole(role)) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireEvidenceGraphAdmin() {
  const user = await requireAdmin();
  assertCanManageEvidenceGraph(user.role);
  return user;
}

export async function getEvidenceGraph(
  jobIdInput: unknown,
): Promise<EvidenceGraphPageData> {
  await requireEvidenceGraphAdmin();
  return loadEvidenceGraphPage(validateEvidenceGraphJobId(jobIdInput));
}

export async function materializeEvidenceGraphForAdmin(
  jobIdInput: unknown,
  specificationIdInput: unknown,
  browserInput?: unknown,
) {
  await requireEvidenceGraphAdmin();
  rejectForbiddenEvidenceGraphFields(browserInput);
  return executeMaterializeEvidenceGraph({
    jobId: validateEvidenceGraphJobId(jobIdInput),
    jobSpecificationVersionId:
      validateEvidenceGraphSpecificationId(specificationIdInput),
  });
}

export function isEvidenceGraphActionError(
  error: unknown,
): error is
  | EvidenceGraphError
  | EvidenceGraphValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof EvidenceGraphError ||
    error instanceof EvidenceGraphValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function evidenceGraphActionErrorMessage(error: unknown) {
  if (error instanceof EvidenceGraphValidationError) {
    return error.message;
  }
  if (error instanceof EvidenceGraphError) {
    if (
      error.code === EVIDENCE_GRAPH_IN_PROGRESS ||
      error.code === EVIDENCE_GRAPH_TENANT_MISMATCH
    ) {
      return error.message;
    }
    return "Resource not found.";
  }
  return "Resource not found.";
}
