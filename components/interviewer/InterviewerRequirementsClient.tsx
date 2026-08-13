"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
} from "@prisma/client";

import {
  clientJobStatusLabels,
  clientRequirementLifecycleLabels,
  formatClientDate,
} from "@/components/client/client-labels";

type InterviewerRequirement = {
  id: number;
  title: string;
  status: JobStatus;
  roleCategory: RoleCategory | null;
  experienceRange: string | null;
  location: string | null;
  numberOfPositions: number | null;
  targetHireDate: Date | null;
  requirementLifecycle: RequirementLifecycle;
  company: { name: string };
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
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return requirements;

    return requirements.filter((requirement) => {
      const haystack = [
        requirement.title,
        requirement.roleCategory,
        requirement.location,
        requirement.company.name,
        clientJobStatusLabels[requirement.status],
        clientRequirementLifecycleLabels[requirement.requirementLifecycle],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [requirements, search]);

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Interviewer portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Requirements</h1>
        <p className="mt-2 text-zinc-600">
          Jobs assigned to you for interview and evaluation work.
        </p>
      </div>

      <div className="mt-8">
        <label htmlFor="interviewer-requirements-search" className="sr-only">
          Search requirements
        </label>
        <input
          id="interviewer-requirements-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by title, role, location..."
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
        />
      </div>

      {requirements.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            No requirements are assigned to you yet.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            No requirements match your search.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {filtered.map((requirement) => {
            const evaluationCount = requirement.applications.filter(
              (application) => application.evaluations.length > 0,
            ).length;

            return (
              <article
                key={requirement.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-black"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-black">
                      {requirement.title}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-600">
                      {requirement.company.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                      {clientJobStatusLabels[requirement.status]}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                      {
                        clientRequirementLifecycleLabels[
                          requirement.requirementLifecycle
                        ]
                      }
                    </span>
                  </div>
                </div>

                <dl className="mt-5 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="font-medium text-black">Role category</dt>
                    <dd>{requirement.roleCategory || "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Location</dt>
                    <dd>{requirement.location || "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Experience</dt>
                    <dd>{requirement.experienceRange || "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Positions</dt>
                    <dd>{requirement.numberOfPositions ?? "Not set"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Candidates</dt>
                    <dd>{requirement._count.applications}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Your evaluations</dt>
                    <dd>{evaluationCount}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-black">Target hire date</dt>
                    <dd>{formatClientDate(requirement.targetHireDate)}</dd>
                  </div>
                </dl>

                <div className="mt-5">
                  <Link
                    href={`/interviewer/requirements/${requirement.id}`}
                    className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    Open Requirement
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
