import {
  createPostedJobWithPublishedSpecification,
  specFieldsFromRecord,
} from "@/lib/jobs/job-specification";
import { validateJobInput } from "@/lib/validation/job-validation";

export type PostedRequirementFields = {
  roleCategory?: unknown;
  experienceRange?: unknown;
  location?: unknown;
  compensationRange?: unknown;
  targetHireDate?: unknown;
  numberOfPositions?: unknown;
  mustHaveRequirements?: unknown;
  niceToHaveRequirements?: unknown;
  jobDescription?: unknown;
  evaluationCriteria?: unknown;
  primarySkills?: unknown;
  sourcingDatabaseSource?: unknown;
  sourcingAccessDetails?: unknown;
};

export async function createPostedRequirementForCompany(input: {
  companyId: number;
  createdByUserId?: number | null;
  title: unknown;
  status?: unknown;
  fields?: PostedRequirementFields;
}) {
  const validated = await validateJobInput(
    input.title,
    input.status ?? "OPEN",
    input.companyId,
    input.fields ?? {},
  );

  return createPostedJobWithPublishedSpecification({
    title: validated.title,
    status: validated.status,
    companyId: validated.companyId,
    createdByUserId: input.createdByUserId ?? null,
    sourcingDatabaseSource: validated.sourcingDatabaseSource ?? null,
    sourcingAccessDetails: validated.sourcingAccessDetails ?? null,
    fields: specFieldsFromRecord({
      title: validated.title,
      roleCategory: validated.roleCategory ?? null,
      experienceRange: validated.experienceRange ?? null,
      location: validated.location ?? null,
      compensationRange: validated.compensationRange ?? null,
      targetHireDate: validated.targetHireDate ?? null,
      numberOfPositions: validated.numberOfPositions ?? null,
      mustHaveRequirements: validated.mustHaveRequirements ?? null,
      niceToHaveRequirements: validated.niceToHaveRequirements ?? null,
      jobDescription: validated.jobDescription ?? null,
      evaluationCriteria: validated.evaluationCriteria ?? null,
      primarySkills: validated.primarySkills ?? null,
    }),
  });
}
