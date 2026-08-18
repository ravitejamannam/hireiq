"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus, RequirementLifecycle } from "@prisma/client";

import { createClientRequirement } from "@/app/actions/job-actions";
import ClientPostRoleModal, {
  type ClientPostRolePayload,
} from "@/components/client/ClientPostRoleModal";
import ClientRequirementCard from "@/components/client/ClientRequirementCard";
import {
  countPipelineStatuses,
  matchesClientRequirementSearch,
  type ClientPipelineCounts,
} from "@/components/client/client-labels";

type ClientRequirement = {
  id: number;
  title: string;
  status: JobStatus;
  requirementLifecycle: RequirementLifecycle;
  location: string | null;
  numberOfPositions: number | null;
  targetHireDate: Date | null;
  company: {
    name: string;
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
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const filteredRequirements = useMemo(() => {
    return initialRequirements.filter((requirement) =>
      matchesClientRequirementSearch(requirement, search),
    );
  }, [initialRequirements, search]);

  function openCreateModal() {
    setActionError("");
    setIsModalOpen(true);
  }

  async function handleCreateRole(payload: ClientPostRolePayload) {
    setIsSaving(true);
    setActionError("");

    try {
      const job = await createClientRequirement(payload.title, payload.fields);
      setIsModalOpen(false);
      router.push(`/client/requirements/${job.id}`);
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
          <h1 className="mt-2 text-3xl font-bold text-black">Requirements</h1>
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

      <div className="mt-8">
        <label htmlFor="client-requirements-search" className="sr-only">
          Search requirements
        </label>
        <input
          id="client-requirements-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by role, location, lifecycle, or status..."
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
        />
      </div>

      {actionError && !isModalOpen ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      {initialRequirements.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            Your company does not have any requirements yet.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Post a role to start hiring for {companyName}.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-6 rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            + Post Role
          </button>
        </div>
      ) : filteredRequirements.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">No matching requirements</p>
          <p className="mt-2 text-sm text-zinc-500">
            Try a different role title, location, lifecycle, or status.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {filteredRequirements.map((requirement) => {
            const pipelineCounts: ClientPipelineCounts = countPipelineStatuses(
              requirement.applications.map((application) => application.status),
            );

            return (
              <ClientRequirementCard
                key={requirement.id}
                id={requirement.id}
                title={requirement.title}
                companyName={requirement.company.name}
                status={requirement.status}
                requirementLifecycle={requirement.requirementLifecycle}
                location={requirement.location}
                numberOfPositions={requirement.numberOfPositions}
                targetHireDate={requirement.targetHireDate}
                profileCount={requirement._count.applications}
                shortlistedCount={pipelineCounts.shortlisted}
                selectedCount={pipelineCounts.selected}
                pipelineCounts={pipelineCounts}
              />
            );
          })}
        </div>
      )}

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
