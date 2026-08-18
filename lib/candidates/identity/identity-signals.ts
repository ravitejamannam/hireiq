import {
  ApplicationIngestionChannel,
  CandidateIdentitySignalKind,
} from "@prisma/client";

import {
  isPlausibleIdentityEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/email-normalization";
import type { IdentityReasonCode } from "@/lib/validation/candidate-identity-validation";

export type ExtractableIngestionEvent = {
  id: number;
  companyId: number;
  candidateId: number | null;
  sourceChannel: ApplicationIngestionChannel;
  applicantEmailNormalized: string | null;
  applicantPhone: string | null;
  applicantLinkedInUrl: string | null;
  externalCandidateId: string | null;
  hostedApplySubmissionId: number | null;
  distributionId: number | null;
};

export type ExtractableHostedApplySubmission = {
  id: number;
  companyId: number;
  emailNormalized: string;
  phone: string | null;
  linkedInUrl: string | null;
};

export type DerivedIdentitySignal = {
  kind: CandidateIdentitySignalKind;
  normalizedValue: string;
  sourceChannel: ApplicationIngestionChannel | null;
  ingestionEventId: number | null;
  hostedApplySubmissionId: number | null;
  duplicateReason: IdentityReasonCode;
};

/**
 * Email: existing trim + lowercase only. No Gmail dot/+tag rewriting.
 */
export function normalizeIdentitySignalEmail(value: string) {
  const normalized = normalizeIdentityEmail(value);
  if (!normalized || !isPlausibleIdentityEmail(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Phone: trim only. Not E.164. V1 does not auto-link on phone.
 */
export function normalizeIdentitySignalPhone(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * LinkedIn URL: trim, lowercase, strip trailing slashes, strip a leading www.
 * Does not prove identity.
 */
export function normalizeIdentityLinkedInUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (!host) {
      return trimmed.toLowerCase().replace(/\/+$/, "");
    }
    return `https://${host}${path}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Provider candidate IDs are namespaced by source channel.
 * Never compare raw IDs across providers or companies.
 */
export function namespaceProviderCandidateId(
  sourceChannel: ApplicationIngestionChannel,
  externalCandidateId: string,
) {
  const trimmed = externalCandidateId.trim();
  if (!trimmed) {
    return null;
  }
  return `${sourceChannel}:${trimmed}`;
}

export function maskIdentityEmail(value: string) {
  const at = value.indexOf("@");
  if (at <= 0) {
    return "***";
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const first = local.charAt(0);
  return `${first}***@${domain}`;
}

export function maskIdentityPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 2) {
    return "***";
  }
  return `***${digits.slice(-2)}`;
}

export function maskIdentityLinkedInUrl(value: string) {
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    return `${parsed.hostname}/***`;
  } catch {
    return "***";
  }
}

export function maskProviderCandidateId(value: string) {
  const idx = value.indexOf(":");
  if (idx <= 0) {
    return "***";
  }
  return `${value.slice(0, idx)}:***`;
}

export function maskIdentitySignalValue(
  kind: CandidateIdentitySignalKind,
  normalizedValue: string,
) {
  switch (kind) {
    case CandidateIdentitySignalKind.EMAIL:
      return maskIdentityEmail(normalizedValue);
    case CandidateIdentitySignalKind.PHONE:
      return maskIdentityPhone(normalizedValue);
    case CandidateIdentitySignalKind.LINKEDIN_URL:
      return maskIdentityLinkedInUrl(normalizedValue);
    case CandidateIdentitySignalKind.PROVIDER_CANDIDATE_ID:
      return maskProviderCandidateId(normalizedValue);
    default:
      return "***";
  }
}

function pushUnique(signals: DerivedIdentitySignal[], signal: DerivedIdentitySignal | null) {
  if (!signal) {
    return;
  }
  const exists = signals.some(
    (item) =>
      item.kind === signal.kind && item.normalizedValue === signal.normalizedValue,
  );
  if (!exists) {
    signals.push(signal);
  }
}

function emailSignal(
  event: ExtractableIngestionEvent,
  raw: string | null,
  hostedApplySubmissionId: number | null,
): DerivedIdentitySignal | null {
  if (!raw) {
    return null;
  }
  const normalizedValue = normalizeIdentitySignalEmail(raw);
  if (!normalizedValue) {
    return null;
  }
  return {
    kind: CandidateIdentitySignalKind.EMAIL,
    normalizedValue,
    sourceChannel: event.sourceChannel,
    ingestionEventId: event.id,
    hostedApplySubmissionId,
    duplicateReason: "EMAIL_EXACT",
  };
}

function phoneSignal(
  event: ExtractableIngestionEvent,
  raw: string | null,
  hostedApplySubmissionId: number | null,
): DerivedIdentitySignal | null {
  if (!raw) {
    return null;
  }
  const normalizedValue = normalizeIdentitySignalPhone(raw);
  if (!normalizedValue) {
    return null;
  }
  return {
    kind: CandidateIdentitySignalKind.PHONE,
    normalizedValue,
    sourceChannel: event.sourceChannel,
    ingestionEventId: event.id,
    hostedApplySubmissionId,
    duplicateReason: "PHONE_EXACT",
  };
}

function linkedInSignal(
  event: ExtractableIngestionEvent,
  raw: string | null,
  hostedApplySubmissionId: number | null,
): DerivedIdentitySignal | null {
  if (!raw) {
    return null;
  }
  const normalizedValue = normalizeIdentityLinkedInUrl(raw);
  if (!normalizedValue) {
    return null;
  }
  return {
    kind: CandidateIdentitySignalKind.LINKEDIN_URL,
    normalizedValue,
    sourceChannel: event.sourceChannel,
    ingestionEventId: event.id,
    hostedApplySubmissionId,
    duplicateReason: "LINKEDIN_URL_EXACT",
  };
}

/**
 * Derive identity signals from an existing ingestion event.
 * T90 is post-ingestion. NAUKRI and channels without contact data yield none.
 */
export function extractSignalsFromIngestionEvent(
  event: ExtractableIngestionEvent,
  submission: ExtractableHostedApplySubmission | null = null,
): DerivedIdentitySignal[] {
  if (!event.candidateId) {
    return [];
  }

  if (event.sourceChannel === ApplicationIngestionChannel.NAUKRI) {
    return [];
  }

  const signals: DerivedIdentitySignal[] = [];
  const submissionId =
    event.hostedApplySubmissionId ?? submission?.id ?? null;

  if (
    event.sourceChannel === ApplicationIngestionChannel.HOSTED_APPLY ||
    event.sourceChannel === ApplicationIngestionChannel.LINKEDIN ||
    event.sourceChannel === ApplicationIngestionChannel.INDEED
  ) {
    pushUnique(
      signals,
      emailSignal(
        event,
        event.applicantEmailNormalized ?? submission?.emailNormalized ?? null,
        submissionId,
      ),
    );
  }

  if (event.sourceChannel === ApplicationIngestionChannel.HOSTED_APPLY) {
    pushUnique(
      signals,
      phoneSignal(event, event.applicantPhone ?? submission?.phone ?? null, submissionId),
    );
    pushUnique(
      signals,
      linkedInSignal(
        event,
        event.applicantLinkedInUrl ?? submission?.linkedInUrl ?? null,
        submissionId,
      ),
    );
  }

  if (
    event.sourceChannel === ApplicationIngestionChannel.LINKEDIN ||
    event.sourceChannel === ApplicationIngestionChannel.INDEED
  ) {
    const namespaced = event.externalCandidateId
      ? namespaceProviderCandidateId(event.sourceChannel, event.externalCandidateId)
      : null;
    if (namespaced) {
      pushUnique(signals, {
        kind: CandidateIdentitySignalKind.PROVIDER_CANDIDATE_ID,
        normalizedValue: namespaced,
        sourceChannel: event.sourceChannel,
        ingestionEventId: event.id,
        hostedApplySubmissionId: submissionId,
        duplicateReason: "PROVIDER_CANDIDATE_ID",
      });
    }
  }

  return signals;
}
