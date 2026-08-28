import {
  createPostedJobWithPublishedSpecification,
  specFieldsFromRecord,
} from "@/lib/jobs/job-specification";
import { narrativeFromFormInput } from "@/lib/jobs/job-posting-view";
import { validateJobInput } from "@/lib/validation/job-validation";
import type { Prisma } from "@prisma/client";

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
  employmentType?: unknown;
  seniorityLevel?: unknown;
  responsibilities?: unknown;
  benefits?: unknown;
  aboutCompany?: unknown;
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

  const narrative = narrativeFromFormInput({
    employmentType: input.fields?.employmentType,
    seniorityLevel: input.fields?.seniorityLevel,
    responsibilities: input.fields?.responsibilities,
    requirements: input.fields?.mustHaveRequirements,
    benefits: input.fields?.benefits,
    aboutCompany: input.fields?.aboutCompany,
  });

  return createPostedJobWithPublishedSpecification({
    title: validated.title,
    status: validated.status,
    companyId: validated.companyId,
    createdByUserId: input.createdByUserId ?? null,
    sourcingDatabaseSource: validated.sourcingDatabaseSource ?? null,
    sourcingAccessDetails: validated.sourcingAccessDetails ?? null,
    structuredPayload: narrative
      ? (narrative as unknown as Prisma.InputJsonValue)
      : undefined,
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
