"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
} from "@prisma/client";

import { createClientRequirement } from "@/app/actions/job-actions";
import ClientPostRoleModal, {
  type ClientPostRolePayload,
} from "@/components/client/ClientPostRoleModal";
import {
  countPipelineStatuses,
} from "@/components/client/client-labels";
import RequirementBoard from "@/components/jobs/RequirementBoard";

type ClientRequirement = {
  id: number;
  title: string;
  status: JobStatus;
  requirementLifecycle: RequirementLifecycle;
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
  createdAt: Date;
  currentPublishedSpecificationVersion?: {
    structuredPayload: unknown;
  } | null;
  company: {
    name: string;
    industry?: string | null;
    employees?: number | null;
  };
  applications: Array<{
    status: Parameters<typeof countPipelineStatuses>[0][number];
  }>;
  _count: {
    applications: number;
  };
};

type ClientRequirementsClientProps = {
  companyName: string;
  initialRequirements: ClientRequirement[];
};

export default function ClientRequirementsClient({
  companyName,
  initialRequirements,
}: ClientRequirementsClientProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  function openCreateModal() {
    setActionError("");
    setIsModalOpen(true);
  }

  async function handleCreateRole(payload: ClientPostRolePayload) {
    setIsSaving(true);
    setActionError("");

    try {
      const result = await createClientRequirement(
        payload.title,
        payload.fields,
        payload.idempotencyKey,
      );
      if ("error" in result) {
        setActionError(result.error);
        return;
      }
      setIsModalOpen(false);
      router.push(`/client/requirements/${result.id}`);
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to create this requirement.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Recruitment
          </p>
          <h1 className="mt-2 text-3xl font-bold text-black">Job board</h1>
          <p className="mt-2 text-zinc-600">
            Open and closed roles for {companyName}.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          + Post Role
        </button>
      </div>

      {actionError && !isModalOpen ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <div className="mt-8">
        <RequirementBoard
          items={initialRequirements.map((requirement) => {
            const pipeline = countPipelineStatuses(
              requirement.applications.map((application) => application.status),
            );
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
              href: `/client/requirements/${requirement.id}`,
              listMeta: `${requirement._count.applications} profiles · ${pipeline.shortlisted} shortlisted`,
            };
          })}
          emptyTitle="Your company does not have any requirements yet."
          emptyBody={`Post a role to start hiring for ${companyName}.`}
        />
      </div>

      <ClientPostRoleModal
        key={isModalOpen ? "open" : "closed"}
        isOpen={isModalOpen}
        isSaving={isSaving}
        errorMessage={actionError}
        onClose={() => {
          setActionError("");
          setIsModalOpen(false);
        }}
        onCreate={handleCreateRole}
      />
    </div>
  );
}
