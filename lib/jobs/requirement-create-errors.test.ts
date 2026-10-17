import { describe, expect, it } from "vitest";

import { requirementCreateFailureMessage } from "@/lib/jobs/requirement-create-errors";
import { JobSpecificationError } from "@/lib/validation/job-specification-validation";
import { JobValidationError } from "@/lib/validation/job-validation";

describe("requirement create failures", () => {
  it("returns the target hire date message", () => {
    expect(
      requirementCreateFailureMessage(
        new JobValidationError("Target hire date is required."),
      ),
    ).toBe("Target hire date is required.");
  });

  it("returns the missing assessment configuration message", () => {
    expect(
      requirementCreateFailureMessage(
        new JobSpecificationError(
          "No assessment is configured for this role category. An administrator must add at least one active assessment question for this role category before the role can be posted.",
        ),
      ),
    ).toBe(
      "No assessment is configured for this role category. An administrator must add at least one active assessment question for this role category before the role can be posted.",
    );
  });

  it("does not hide unexpected errors", () => {
    expect(requirementCreateFailureMessage(new Error("database down"))).toBeNull();
  });
});
