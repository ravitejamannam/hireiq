export const ASSESSMENT_WINDOW_CLOSED = "This assessment window has closed.";
export const ASSESSMENT_UNAVAILABLE = "This assessment is unavailable.";
export const ASSESSMENT_ALREADY_SUBMITTED = "This assessment has already been submitted.";
export const ASSESSMENT_GENERIC_FAILURE = "Something went wrong. Please try again.";
export const ASSESSMENT_BANK_EMPTY =
  "No assessment is configured for this role category. An administrator must add at least one active assessment question for this role category before the role can be posted.";
export const ASSESSMENT_ROLE_CATEGORY_REQUIRED =
  "A role category is required to enable HireIQ hosted apply.";
export const ASSESSMENT_ANSWERS_REQUIRED = "Answer every question before submitting.";
export const ASSESSMENT_INVITE_SECRET_REQUIRED =
  "Assessment invites require AUTH_SECRET.";

export type AssessmentErrorCode = "UNAVAILABLE" | "EXPIRED" | "SUBMITTED";

export class AssessmentError extends Error {
  readonly code: AssessmentErrorCode;

  constructor(message: string, code: AssessmentErrorCode) {
    super(message);
    this.name = "AssessmentError";
    this.code = code;
  }
}

export class AssessmentValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Please correct the highlighted fields.");
    this.name = "AssessmentValidationError";
    this.fields = fields;
  }
}
