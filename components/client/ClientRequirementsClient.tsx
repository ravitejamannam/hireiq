"use client";

import { useMemo, useState } from "react";
import type { JobStatus, RequirementLifecycle } from "@prisma/client";

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
  const [search, setSearch] = useState("");

  const filteredRequirements = useMemo(() => {
    return initialRequirements.filter((requirement) =>
      matchesClientRequirementSearch(requirement, search),
    );
  }, [initialRequirements, search]);

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Recruitment
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Requirements</h1>
        <p className="mt-2 text-zinc-600">
          Open and closed roles for {companyName}.
        </p>
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

      {initialRequirements.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            Your company does not have any requirements yet.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Requirements appear here once HireIQ posts roles for your company.
          </p>
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
    </div>
  );
}
