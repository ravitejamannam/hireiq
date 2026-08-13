"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ApplicationPipelineStatus } from "@prisma/client";

import {
  clientPipelineStatusLabels,
  formatClientOptional,
  getClientPipelineStatusLabel,
  getClientSourceLabel,
} from "@/components/client/client-labels";

type InterviewerCandidateRow = {
  id: number;
  status: ApplicationPipelineStatus;
  source: string | null;
  expertScore: number | null;
  candidate: {
    name: string;
    role: string;
    experienceYears: number;
    location: string | null;
    currentEmployer: string | null;
    skills: string | null;
    expectedCTC: string | null;
  };
  evaluations: Array<{
    id: number;
    evaluatedAt: Date | null;
  }>;
  job: {
    id: number;
    title: string;
    companyName: string;
  };
};

type InterviewerCandidatesClientProps = {
  candidates: InterviewerCandidateRow[];
};

const PIPELINE_FILTERS: Array<ApplicationPipelineStatus | "ALL"> = [
  "ALL",
  "CV_POOL",
  "EXPERT_REVIEW",
  "TECH_EVALUATION",
  "SHORTLISTED",
  "SELECTED",
  "HIRED",
  "REJECTED",
];

function evaluationStatusLabel(row: InterviewerCandidateRow) {
  const evaluation = row.evaluations[0];
  if (!evaluation) return "Not started";
  if (evaluation.evaluatedAt) return "Completed";
  return "In progress";
}

export default function InterviewerCandidatesClient({
  candidates,
}: InterviewerCandidatesClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    ApplicationPipelineStatus | "ALL"
  >("ALL");

  const availableStatuses = useMemo(() => {
    const present = new Set(candidates.map((candidate) => candidate.status));
    return PIPELINE_FILTERS.filter(
      (status) => status === "ALL" || present.has(status),
    );
  }, [candidates]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return candidates.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) {
        return false;
      }

      if (!normalized) return true;

      const haystack = [
        row.candidate.name,
        row.candidate.role,
        row.candidate.currentEmployer,
        row.candidate.location,
        row.candidate.skills,
        row.job.title,
        row.job.companyName,
        getClientPipelineStatusLabel(row.status),
        evaluationStatusLabel(row),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [candidates, search, statusFilter]);

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Interviewer portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">
          Assigned Candidates
        </h1>
        <p className="mt-2 text-zinc-600">
          Candidates from requirements assigned to you.
        </p>
      </div>

      <div className="mt-8">
        <label htmlFor="interviewer-all-candidates-search" className="sr-only">
          Search candidates
        </label>
        <input
          id="interviewer-all-candidates-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, role, employer, location, skills..."
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {availableStatuses.map((status) => {
          const isActive = statusFilter === status;
          const label =
            status === "ALL" ? "All" : clientPipelineStatusLabels[status];

          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "bg-black text-white"
                  : "border border-zinc-300 bg-white text-black hover:bg-zinc-100"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {candidates.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            No assigned candidates yet.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            No candidates match your filters.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {filtered.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-black"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-black">
                    {row.candidate.name}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    {row.candidate.role} · {row.job.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {row.job.companyName}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                    {getClientPipelineStatusLabel(row.status)}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                    {evaluationStatusLabel(row)}
                  </span>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="font-medium text-black">Experience</dt>
                  <dd>{row.candidate.experienceYears} years</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Location</dt>
                  <dd>{formatClientOptional(row.candidate.location)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Employer</dt>
                  <dd>
                    {formatClientOptional(row.candidate.currentEmployer)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Source</dt>
                  <dd>{getClientSourceLabel(row.source)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-black">Expert score</dt>
                  <dd>{formatClientOptional(row.expertScore)}</dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="font-medium text-black">Skills</dt>
                  <dd>{formatClientOptional(row.candidate.skills)}</dd>
                </div>
              </dl>

              <div className="mt-5">
                <Link
                  href={`/interviewer/requirements/${row.job.id}/candidates/${row.id}`}
                  className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Open Candidate
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
