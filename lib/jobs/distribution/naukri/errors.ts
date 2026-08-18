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

export const PARTNER_ACCESS_UNAVAILABLE_MESSAGE =
  "Naukri partner integration is unavailable.";

export function naukriUnavailableResult(): AdapterFailure {
  return {
    ok: false,
    retryable: false,
    code: PROVIDER_UNAVAILABLE_CODE,
    message: PARTNER_ACCESS_UNAVAILABLE_MESSAGE,
  };
}

export function naukriUnsupportedOperation(operation: string): AdapterFailure {
  return {
    ok: false,
    retryable: false,
    code: UNSUPPORTED_OPERATION_CODE,
    message: `${operation} is not supported for Naukri / Zwayam Amplify.`,
  };
}

/**
 * Normalize HTTP-like Naukri/Amplify failures. No raw provider body is returned.
 * Intended mapping only — production never contacts Naukri/Zwayam.
 */
export function normalizeNaukriHttpFailure(status: number): AdapterFailure {
  if (status === 400) {
    return {
      ok: false,
      retryable: false,
      code: PROVIDER_PAYLOAD_REJECTED,
      message: "Naukri rejected the job payload.",
    };
  }

  if (status === 401) {
    return {
      ok: false,
      retryable: false,
      code: CONNECTION_UNAUTHORIZED,
      message: "Naukri credentials are not authorized.",
    };
  }

  if (status === 403) {
    return {
      ok: false,
      retryable: false,
      code: CONNECTION_UNAUTHORIZED,
      message: "Naukri access is forbidden.",
    };
  }

  if (status === 429) {
    return {
      ok: false,
      retryable: true,
      code: PROVIDER_RATE_LIMITED,
      message: "Naukri rate-limited the request.",
    };
  }

  if (status >= 500 && status <= 599) {
    return {
      ok: false,
      retryable: true,
      code: PROVIDER_UNAVAILABLE_CODE,
      message: "Naukri is temporarily unavailable.",
    };
  }

  return {
    ok: false,
    retryable: true,
    code: UNKNOWN_PROVIDER_RESULT,
    message: "Naukri returned an unexpected result.",
  };
}

export function unknownCreateResult(): AdapterFailure {
  return {
    ok: false,
    retryable: true,
    code: UNKNOWN_PROVIDER_RESULT,
    message:
      "Naukri create did not confirm. Retry will reconcile rather than blindly recreate.",
  };
}
