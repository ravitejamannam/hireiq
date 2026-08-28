"use client";

import type {
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
} from "@prisma/client";

import RequirementBoard from "@/components/jobs/RequirementBoard";

type InterviewerRequirement = {
  id: number;
  title: string;
  status: JobStatus;
  roleCategory: RoleCategory | null;
  experienceRange: string | null;
  location: string | null;
  compensationRange: string | null;
  numberOfPositions: number | null;
  targetHireDate: Date | null;
  jobDescription: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  primarySkills: string | null;
  requirementLifecycle: RequirementLifecycle;
  createdAt: Date;
  currentPublishedSpecificationVersion?: {
    structuredPayload: unknown;
  } | null;
  company: { name: string; industry?: string | null; employees?: number | null };
  _count: { applications: number };
  applications: Array<{
    evaluations: Array<{ id: number }>;
  }>;
};

type InterviewerRequirementsClientProps = {
  requirements: InterviewerRequirement[];
};

export default function InterviewerRequirementsClient({
  requirements,
}: InterviewerRequirementsClientProps) {
  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Interviewer portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Job board</h1>
        <p className="mt-2 text-zinc-600">
          Jobs assigned to you for interview and evaluation work.
        </p>
      </div>

      <div className="mt-8">
        <RequirementBoard
          items={requirements.map((requirement) => {
            const evaluationCount = requirement.applications.filter(
              (application) => application.evaluations.length > 0,
            ).length;
            return {
              id: requirement.id,
              title: requirement.title,
              companyName: requirement.company.name,
              companyIndustry: requirement.company.industry,
              companyEmployees: requirement.company.employees,
              location: requirement.location,
              status: requirement.status,
              roleCategory: requirement.roleCategory,
              experienceRange: requirement.experienceRange,
              numberOfPositions: requirement.numberOfPositions,
              compensationRange: requirement.compensationRange,
              jobDescription: requirement.jobDescription,
              mustHaveRequirements: requirement.mustHaveRequirements,
              niceToHaveRequirements: requirement.niceToHaveRequirements,
              primarySkills: requirement.primarySkills,
              structuredPayload:
                requirement.currentPublishedSpecificationVersion
                  ?.structuredPayload,
              createdAt: requirement.createdAt,
              href: `/interviewer/requirements/${requirement.id}`,
              listMeta: `${requirement._count.applications} candidates · ${evaluationCount} of your evaluations`,
            };
          })}
          emptyTitle="No requirements are assigned to you yet."
        />
      </div>
    </div>
  );
}
