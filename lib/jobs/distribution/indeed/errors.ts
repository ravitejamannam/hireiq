import type { AdapterFailure } from "@/lib/jobs/distribution/adapter";
import {
  PROVIDER_UNAVAILABLE_CODE,
  UNSUPPORTED_OPERATION_CODE,
} from "@/lib/jobs/distribution/adapter";

export const PARTNER_ACCESS_UNAVAILABLE = "PARTNER_ACCESS_UNAVAILABLE";
export const CONNECTION_UNAUTHORIZED = "CONNECTION_UNAUTHORIZED";
export const PROVIDER_PAYLOAD_REJECTED = "PROVIDER_PAYLOAD_REJECTED";
export const PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED";
export const UNKNOWN_PROVIDER_RESULT = "UNKNOWN_PROVIDER_RESULT";
export const INDEED_WEBHOOK_UNCONFIGURED = "INDEED_WEBHOOK_UNCONFIGURED";
export const INDEED_WEBHOOK_INVALID_SIGNATURE =
  "INDEED_WEBHOOK_INVALID_SIGNATURE";
export const INDEED_WEBHOOK_MALFORMED = "INDEED_WEBHOOK_MALFORMED";
export const INDEED_POSTING_NOT_FOUND = "INDEED_POSTING_NOT_FOUND";

export const PARTNER_ACCESS_UNAVAILABLE_MESSAGE =
  "Indeed partner integration is unavailable.";

export function indeedUnavailableResult(): AdapterFailure {
  return {
    ok: false,
    retryable: false,
    code: PROVIDER_UNAVAILABLE_CODE,
    message: PARTNER_ACCESS_UNAVAILABLE_MESSAGE,
  };
}

export function indeedUnsupportedOperation(operation: string): AdapterFailure {
  return {
    ok: false,
    retryable: false,
    code: UNSUPPORTED_OPERATION_CODE,
    message: `${operation} is not supported for Indeed Job Sync.`,
  };
}

/**
 * Normalize HTTP-like Indeed failures. No raw provider body is returned.
 */
export function normalizeIndeedHttpFailure(status: number): AdapterFailure {
  if (status === 400) {
    return {
      ok: false,
      retryable: false,
      code: PROVIDER_PAYLOAD_REJECTED,
      message: "Indeed rejected the job payload.",
    };
  }

  if (status === 401) {
    return {
      ok: false,
      retryable: false,
      code: CONNECTION_UNAUTHORIZED,
      message: "Indeed credentials are not authorized.",
    };
  }

  if (status === 403) {
    return {
      ok: false,
      retryable: false,
      code: CONNECTION_UNAUTHORIZED,
      message: "Indeed access is forbidden.",
    };
  }

  if (status === 429) {
    return {
      ok: false,
      retryable: true,
      code: PROVIDER_RATE_LIMITED,
      message: "Indeed rate-limited the request.",
    };
  }

  if (status >= 500 && status <= 599) {
    return {
      ok: false,
      retryable: true,
      code: PROVIDER_UNAVAILABLE_CODE,
      message: "Indeed is temporarily unavailable.",
    };
  }

  return {
    ok: false,
    retryable: true,
    code: UNKNOWN_PROVIDER_RESULT,
    message: "Indeed returned an unexpected result.",
  };
}

export function unknownCreateResult(): AdapterFailure {
  return {
    ok: false,
    retryable: true,
    code: UNKNOWN_PROVIDER_RESULT,
    message:
      "Indeed create did not confirm. Retry will reconcile rather than blindly recreate.",
  };
}
