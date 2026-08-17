export const JOB_DESCRIPTION_MAX_LENGTH = 8000;
export const JOB_DESCRIPTION_FIELD_MAX_LENGTH = 4000;
export const JOB_DESCRIPTION_COMBINED_INPUT_MAX_LENGTH = 16000;

export class JobDescriptionAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobDescriptionAiError";
  }
}

export const JOB_DESCRIPTION_AI_UNCHANGED_ERROR =
  "We couldn't generate the job description right now. Your requirement was not changed.";

export const JOB_DESCRIPTION_AI_IN_PROGRESS_ERROR =
  "A job description is already being generated.";

export const JOB_DESCRIPTION_AI_NO_DRAFT_ERROR =
  "A draft specification is required to generate a job description.";

export const JOB_DESCRIPTION_AI_NO_PROPOSAL_ERROR =
  "No generated job description is available to accept.";

export type JobDescriptionAiOutput = {
  jobDescription: string;
};

export function validateJobDescriptionAiOutput(
  value: unknown,
): JobDescriptionAiOutput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  const record = value as Record<string, unknown>;
  if (typeof record.jobDescription !== "string") {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  const jobDescription = record.jobDescription.trim();
  if (!jobDescription) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  if (jobDescription.length > JOB_DESCRIPTION_MAX_LENGTH) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  return { jobDescription };
}
