"use server";

import { PortalRole } from "@prisma/client";

import {
  AuthorizationError,
  deniesCrossCompany,
  requireJobAccess,
  requireUser,
} from "@/lib/auth/authorization";
import {
  createInboundRoute,
  getInboundMessage,
  getInboundRoute,
  listInboundMessages,
  retryInboundEmailMessage,
  setInboundRouteEnabled,
} from "@/lib/inbound/inbound-service";
import { inboundConfigured } from "@/lib/inbound/contract";

async function authorize(jobId: number) {
  const user = await requireUser();
  if (user.role === PortalRole.INTERVIEWER) throw new AuthorizationError("Resource not found.");
  const { job } = await requireJobAccess(jobId);
  if (deniesCrossCompany(user, job.companyId)) throw new AuthorizationError("Resource not found.");
  return { user, companyId: job.companyId };
}

export async function loadInboundContext(jobId: number) {
  const { companyId } = await authorize(jobId);
  const [route, messages] = await Promise.all([
    getInboundRoute(companyId, jobId),
    listInboundMessages(companyId, jobId),
  ]);
  return { configured: inboundConfigured(), route, messages };
}

export async function createInboundRouteAction(jobId: number) {
  try {
    const { user, companyId } = await authorize(jobId);
    return createInboundRoute({
      companyId,
      jobId,
      actorUserId: user.id,
      actorRole: user.role,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false as const, error: "You cannot configure this job." };
    return { ok: false as const, error: "Inbound route was not created." };
  }
}

export async function setInboundRouteEnabledAction(jobId: number, enabled: boolean) {
  try {
    const { user, companyId } = await authorize(jobId);
    return setInboundRouteEnabled({
      companyId,
      jobId,
      enabled,
      actorUserId: user.id,
      actorRole: user.role,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false as const, error: "You cannot change this route." };
    return { ok: false as const, error: "Route was not updated." };
  }
}

export async function retryInboundMessageAction(jobId: number, messageId: number) {
  try {
    const { companyId } = await authorize(jobId);
    const message = await getInboundMessage(companyId, messageId);
    if (!message || message.jobId !== jobId) return { ok: false as const, error: "Message not found." };
    return retryInboundEmailMessage(companyId, messageId);
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false as const, error: "You cannot retry this message." };
    return { ok: false as const, error: "Retry did not finish." };
  }
}
