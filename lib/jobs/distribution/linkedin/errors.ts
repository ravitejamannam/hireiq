import type { AdapterFailure } from "@/lib/jobs/distribution/adapter";
import { PROVIDER_UNAVAILABLE_CODE } from "@/lib/jobs/distribution/adapter";

export const PARTNER_ACCESS_UNAVAILABLE = "PARTNER_ACCESS_UNAVAILABLE";
export const CONNECTION_UNAUTHORIZED = "CONNECTION_UNAUTHORIZED";
export const PROVIDER_PAYLOAD_REJECTED = "PROVIDER_PAYLOAD_REJECTED";
export const PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED";
export const UNKNOWN_PROVIDER_RESULT = "UNKNOWN_PROVIDER_RESULT";
export const LINKEDIN_WEBHOOK_UNCONFIGURED = "LINKEDIN_WEBHOOK_UNCONFIGURED";
export const LINKEDIN_WEBHOOK_INVALID_SIGNATURE =
  "LINKEDIN_WEBHOOK_INVALID_SIGNATURE";
export const LINKEDIN_WEBHOOK_MALFORMED = "LINKEDIN_WEBHOOK_MALFORMED";
export const LINKEDIN_POSTING_NOT_FOUND = "LINKEDIN_POSTING_NOT_FOUND";

export const PARTNER_ACCESS_UNAVAILABLE_MESSAGE =
  "LinkedIn partner integration is unavailable.";

export function linkedInUnavailableResult(): AdapterFailure {
  return {
    ok: false,
    retryable: false,
    code: PROVIDER_UNAVAILABLE_CODE,
    message: PARTNER_ACCESS_UNAVAILABLE_MESSAGE,
  };
}

/**
 * Normalize HTTP-like LinkedIn failures. No raw provider body is returned.
 */
export function normalizeLinkedInHttpFailure(status: number): AdapterFailure {
  if (status === 400) {
    return {
      ok: false,
      retryable: false,
      code: PROVIDER_PAYLOAD_REJECTED,
      message: "LinkedIn rejected the job payload.",
    };
  }

  if (status === 401) {
    return {
      ok: false,
      retryable: false,
      code: CONNECTION_UNAUTHORIZED,
      message: "LinkedIn credentials are not authorized.",
    };
  }

  if (status === 403) {
    return {
      ok: false,
      retryable: false,
      code: CONNECTION_UNAUTHORIZED,
      message: "LinkedIn access is forbidden.",
    };
  }

  if (status === 429) {
    return {
      ok: false,
      retryable: true,
      code: PROVIDER_RATE_LIMITED,
      message: "LinkedIn rate-limited the request.",
    };
  }

  if (status >= 500 && status <= 599) {
    return {
      ok: false,
      retryable: true,
      code: PROVIDER_UNAVAILABLE_CODE,
      message: "LinkedIn is temporarily unavailable.",
    };
  }

  return {
    ok: false,
    retryable: true,
    code: UNKNOWN_PROVIDER_RESULT,
    message: "LinkedIn returned an unexpected result.",
  };
}

export function unknownCreateResult(): AdapterFailure {
  return {
    ok: false,
    retryable: true,
    code: UNKNOWN_PROVIDER_RESULT,
    message:
      "LinkedIn create did not confirm. Retry will reconcile rather than blindly recreate.",
  };
}
