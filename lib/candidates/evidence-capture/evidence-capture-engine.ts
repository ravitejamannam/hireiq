import {
  CAPTURE_SKIP_REASON,
  type EvidenceCaptureSkipReason,
  type EvidenceCaptureSkipReasons,
} from "@/lib/candidates/evidence-capture/evidence-capture-types";

export function hasEvidenceLikeText(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function emptySkipReasons(): EvidenceCaptureSkipReasons {
  return {};
}

export function incrementSkipReason(
  reasons: EvidenceCaptureSkipReasons,
  reason: EvidenceCaptureSkipReason,
) {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

export function isHostedApplyCoverLetterEvidence(
  coverLetter: string | null | undefined,
) {
  return hasEvidenceLikeText(coverLetter);
}

/**
 * Provider ingestion rows store identity/profile-like fields only.
 * Those are not evidence-like text. Do not treat them as capture sources.
 */
export function ingestionEventHasEvidenceLikeText() {
  return false;
}

export { CAPTURE_SKIP_REASON };
