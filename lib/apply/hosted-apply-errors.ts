export const APPLY_LINK_UNAVAILABLE = "This application link is unavailable.";
export const ROLE_NO_LONGER_ACCEPTING =
  "This role is no longer accepting applications.";
export const HOSTED_APPLY_GENERIC_FAILURE =
  "Something went wrong. Please try again.";
export const HOSTED_APPLY_APP_URL_REQUIRED =
  "Public application URL is not configured.";

export type HostedApplyErrorCode = "UNAVAILABLE" | "CLOSED";

export class HostedApplyError extends Error {
  readonly code: HostedApplyErrorCode;

  constructor(message: string, code: HostedApplyErrorCode) {
    super(message);
    this.name = "HostedApplyError";
    this.code = code;
  }
}

export class HostedApplyValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Please correct the highlighted fields.");
    this.name = "HostedApplyValidationError";
    this.fields = fields;
  }
}
