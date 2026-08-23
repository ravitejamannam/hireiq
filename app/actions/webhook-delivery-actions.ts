"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getWebhookDeliveryForAdmin,
  getWebhookDeliveryHealth,
  listWebhookDeliveries,
  replayQuarantinedDeliveryForAdmin,
  WebhookReplayError,
} from "@/lib/jobs/distribution/webhook-delivery-admin";

export async function getIntegrationHealth() {
  return getWebhookDeliveryHealth();
}

export async function getWebhookDeliveries(filter: {
  status?: unknown;
  provider?: unknown;
} = {}) {
  return listWebhookDeliveries({ ...filter, take: 100 });
}

export async function getWebhookDeliveryDetail(id: unknown) {
  return getWebhookDeliveryForAdmin(id);
}

function isAuthError(error: unknown) {
  return error instanceof AuthenticationError;
}

function replayErrorMessage(error: unknown): string {
  if (error instanceof WebhookReplayError && error.code === "REPLAY_NOT_QUARANTINED") {
    return "Only quarantined deliveries can be replayed.";
  }
  if (error instanceof WebhookReplayError && error.code === "REPLAY_NO_PAYLOAD") {
    return "This delivery has no stored payload to replay.";
  }
  if (error instanceof WebhookReplayError && error.code === "DELIVERY_NOT_FOUND") {
    return "Webhook delivery not found.";
  }
  if (error instanceof WebhookReplayError) {
    return error.message;
  }
  return "Replay failed. Check the delivery details and try again.";
}

export async function replayQuarantinedDelivery(id: unknown) {
  try {
    const result = await replayQuarantinedDeliveryForAdmin(id);
    revalidatePath("/dashboard/integrations");
    if (typeof id === "string" || typeof id === "number") {
      revalidatePath(`/dashboard/integrations/${id}`);
    }
    return result;
  } catch (error) {
    if (isAuthError(error)) throw error;
    return { ok: false as const, error: replayErrorMessage(error) };
  }
}
