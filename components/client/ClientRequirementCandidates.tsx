"use client";

import { useMemo, useState } from "react";
import type { ApplicationPipelineStatus } from "@prisma/client";

import ClientCandidateCard, {
  type ClientCandidateCardData,
} from "@/components/client/ClientCandidateCard";
import {
  clientPipelineStatusLabels,
  matchesClientCandidateSearch,
} from "@/components/client/client-labels";

type StatusFilter = "ALL" | ApplicationPipelineStatus;

const STATUS_FILTERS: StatusFilter[] = [
  "ALL",
  "CV_POOL",
  "EXPERT_REVIEW",
  "TECH_EVALUATION",
  "SHORTLISTED",
  "SELECTED",
  "REJECTED",
  "HIRED",
];

type ClientRequirementCandidatesProps = {
  requirementId: number;
  candidates: ClientCandidateCardData[];
};

export default function ClientRequirementCandidates({
  requirementId,
  candidates,
}: ClientRequirementCandidatesProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (statusFilter !== "ALL" && candidate.status !== statusFilter) {
        return false;
      }

      return matchesClientCandidateSearch(candidate, search);
    });
  }, [candidates, search, statusFilter]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-black">Candidates</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {candidates.length} candidate{candidates.length === 1 ? "" : "s"} for
            this requirement.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <label htmlFor={`client-candidates-search-${requirementId}`} className="sr-only">
          Search candidates
        </label>
        <input
          id={`client-candidates-search-${requirementId}`}
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search candidates..."
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
        />

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((status) => {
            const label =
              status === "ALL" ? "All" : clientPipelineStatusLabels[status];
            const isActive = statusFilter === status;

            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-black text-white"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            No candidates have been added to this requirement yet.
          </p>
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            No candidates match your search or filter.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {filteredCandidates.map((candidate) => (
            <ClientCandidateCard
              key={candidate.applicationId}
              candidate={candidate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
