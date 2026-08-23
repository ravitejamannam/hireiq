import { ApplicationIngestionError } from "@/lib/ingestion/ingestion-errors";
import {
  ingestLinkedInApplication,
  type SafeLinkedInIngestionEvent,
} from "@/lib/ingestion/linkedin-ingestion";
import {
  LINKEDIN_POSTING_NOT_FOUND,
  LINKEDIN_WEBHOOK_INVALID_SIGNATURE,
  LINKEDIN_WEBHOOK_MALFORMED,
  LINKEDIN_WEBHOOK_UNCONFIGURED,
} from "@/lib/jobs/distribution/linkedin/errors";
import {
  computeLinkedInWebhookSignature,
  linkedInSignaturesMatch,
  readLinkedInWebhookSecret,
} from "@/lib/jobs/distribution/linkedin/signature";

export class LinkedInWebhookError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(message: string, code: string, httpStatus: number) {
    super(message);
    this.name = "LinkedInWebhookError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * HireIQ-normalized LinkedIn webhook envelope.
 * This is NOT LinkedIn's unpublished partner schema. Extra fields such as
 * companyId/jobId are ignored and never used as tenant authority.
 */
export type LinkedInWebhookEnvelope = {
  eventType: "APPLICATION_SUBMITTED";
  externalPostingId: string;
  externalApplicationId: string;
  applicantName: string;
  applicantEmailNormalized?: string | null;
  applicantLocation?: string | null;
  applicantExperienceYears?: number | null;
  externalCandidateId?: string | null;
};

function parseEnvelope(rawBody: string): LinkedInWebhookEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new LinkedInWebhookError(
      "Malformed webhook body.",
      LINKEDIN_WEBHOOK_MALFORMED,
      400,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LinkedInWebhookError(
      "Malformed webhook body.",
      LINKEDIN_WEBHOOK_MALFORMED,
      400,
    );
  }

  const body = parsed as Record<string, unknown>;
  if (body.eventType !== "APPLICATION_SUBMITTED") {
    throw new LinkedInWebhookError(
      "Malformed webhook body.",
      LINKEDIN_WEBHOOK_MALFORMED,
      400,
    );
  }

  if (
    typeof body.externalPostingId !== "string" ||
    !body.externalPostingId.trim() ||
    typeof body.externalApplicationId !== "string" ||
    !body.externalApplicationId.trim() ||
    typeof body.applicantName !== "string" ||
    !body.applicantName.trim()
  ) {
    throw new LinkedInWebhookError(
      "Malformed webhook body.",
      LINKEDIN_WEBHOOK_MALFORMED,
      400,
    );
  }

  return {
    eventType: "APPLICATION_SUBMITTED",
    externalPostingId: body.externalPostingId.trim(),
    externalApplicationId: body.externalApplicationId.trim(),
    applicantName: body.applicantName.trim(),
    applicantEmailNormalized:
      typeof body.applicantEmailNormalized === "string"
        ? body.applicantEmailNormalized
        : null,
    applicantLocation:
      typeof body.applicantLocation === "string" ? body.applicantLocation : null,
    applicantExperienceYears:
      typeof body.applicantExperienceYears === "number"
        ? body.applicantExperienceYears
        : null,
    externalCandidateId:
      typeof body.externalCandidateId === "string"
        ? body.externalCandidateId
        : null,
  };
}

export async function processLinkedInWebhook(input: {
  rawBody: string;
  signature: string | null;
  companyIdFromBrowser?: unknown;
  jobIdFromBrowser?: unknown;
}): Promise<{ ok: true; event: SafeLinkedInIngestionEvent }> {
  void input.companyIdFromBrowser;
  void input.jobIdFromBrowser;

  const secret = readLinkedInWebhookSecret();
  if (!secret) {
    throw new LinkedInWebhookError(
      "LinkedIn webhook is not configured.",
      LINKEDIN_WEBHOOK_UNCONFIGURED,
      503,
    );
  }

  const expected = computeLinkedInWebhookSignature(input.rawBody, secret);
  if (!linkedInSignaturesMatch(input.signature, expected)) {
    throw new LinkedInWebhookError(
      "Invalid webhook signature.",
      LINKEDIN_WEBHOOK_INVALID_SIGNATURE,
      401,
    );
  }

  const envelope = parseEnvelope(input.rawBody);

  try {
    const event = await ingestLinkedInApplication({
      externalPostingId: envelope.externalPostingId,
      externalApplicationId: envelope.externalApplicationId,
      applicantName: envelope.applicantName,
      applicantEmailNormalized: envelope.applicantEmailNormalized,
      applicantLocation: envelope.applicantLocation,
      applicantExperienceYears: envelope.applicantExperienceYears,
      externalCandidateId: envelope.externalCandidateId,
      companyIdFromBrowser: input.companyIdFromBrowser,
      jobIdFromBrowser: input.jobIdFromBrowser,
    });
    return { ok: true, event };
  } catch (error) {
    if (
      error instanceof ApplicationIngestionError &&
      error.code === LINKEDIN_POSTING_NOT_FOUND
    ) {
      throw new LinkedInWebhookError(
        "Unknown LinkedIn posting.",
        LINKEDIN_POSTING_NOT_FOUND,
        404,
      );
    }
    throw error;
  }
}

/**
 * Best-effort extraction of the provider's application id for ledger
 * attribution. Never throws — returns null when the payload cannot be
 * parsed. Used by webhook routes so quarantined deliveries keep their
 * dedup identity.
 */
export function extractLinkedInExternalEventId(rawBody: string): string | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).externalApplicationId === "string"
    ) {
      return (parsed as Record<string, unknown>).externalApplicationId as string;
    }
  } catch {
    // fall through
  }
  return null;
}
