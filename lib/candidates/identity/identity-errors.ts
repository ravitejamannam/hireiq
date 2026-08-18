export class CandidateIdentityError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "CandidateIdentityError";
    this.code = code;
  }
}

export const IDENTITY_NOT_FOUND = "IDENTITY_NOT_FOUND";
export const IDENTITY_GROUP_CONFLICT_CODE = "IDENTITY_GROUP_CONFLICT";
export const IDENTITY_CROSS_COMPANY_CODE = "IDENTITY_CROSS_COMPANY";

export function isCandidateIdentityUserError(
  error: unknown,
): error is CandidateIdentityError {
  return error instanceof CandidateIdentityError;
}
