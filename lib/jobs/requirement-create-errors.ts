import { JobSpecificationError } from "@/lib/validation/job-specification-validation";
import { JobValidationError } from "@/lib/validation/job-validation";

/** User-facing message for an expected requirement-create failure. Null for unexpected errors. */
export function requirementCreateFailureMessage(error: unknown): string | null {
  if (
    error instanceof JobValidationError ||
    error instanceof JobSpecificationError
  ) {
    return error.message;
  }
  return null;
}
