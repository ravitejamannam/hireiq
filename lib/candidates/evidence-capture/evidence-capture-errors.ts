export class EvidenceCaptureError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "EvidenceCaptureError";
    this.code = code;
  }
}

export const CAPTURE_UNAUTHORIZED = "UNAUTHORIZED";
export const CAPTURE_FORBIDDEN = "FORBIDDEN";
export const CAPTURE_JOB_NOT_FOUND = "JOB_NOT_FOUND";
export const CAPTURE_APPLICATION_NOT_FOUND = "APPLICATION_NOT_FOUND";
export const CAPTURE_WRONG_TENANT = "WRONG_TENANT";
export const CAPTURE_NO_TEXT = "NO_TEXT";
export const CAPTURE_INVALID_TEXT = "INVALID_TEXT";
export const CAPTURE_DUPLICATE_EVIDENCE = "DUPLICATE_EVIDENCE";
export const CAPTURE_UNSUPPORTED_SOURCE = "UNSUPPORTED_SOURCE";
export const CAPTURE_INTERNAL_ERROR = "INTERNAL_ERROR";

export const CAPTURE_GENERIC_ERROR =
  "We couldn't capture textual evidence right now.";
