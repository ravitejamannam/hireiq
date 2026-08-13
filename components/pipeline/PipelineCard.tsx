"use client";

import Link from "next/link";
import type {
  ApplicationPipelineStatus,
  SourcingDatabaseSource,
} from "@prisma/client";
import {
  getApplicationPipelineStatusLabel,
  getApplicationSourceLabel,
} from "@/components/applications/ApplicationForm";

export type PipelineMoveOption = {
  status: ApplicationPipelineStatus;
  label: string;
};

type PipelineCardProps = {
  id: number;
  candidateName: string;
  candidateRole: string;
  currentEmployer: string | null;
  location: string | null;
  experienceYears: number;
  skills: string | null;
  expectedCTC: string | null;
  jobTitle: string;
  companyName: string;
  source: SourcingDatabaseSource | null;
  expertScore: number | null;
  status: ApplicationPipelineStatus;
  moveOptions: PipelineMoveOption[];
  monitorNote?: string | null;
  isMoving?: boolean;
  requirementHref?: string | null;
  onMove: (id: number, nextStatus: ApplicationPipelineStatus) => void;
};

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "Not provided";
  }

  return value;
}

export default function PipelineCard({
  id,
  candidateName,
  candidateRole,
  currentEmployer,
  location,
  experienceYears,
  skills,
  expectedCTC,
  jobTitle,
  companyName,
  source,
  expertScore,
  status,
  moveOptions,
  monitorNote = null,
  isMoving = false,
  requirementHref = null,
  onMove,
}: PipelineCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-black">{candidateName}</h3>
          <p className="mt-1 text-sm text-zinc-500">{candidateRole}</p>
          <p className="mt-1 text-xs text-zinc-400">
            {jobTitle} - {companyName}
          </p>
        </div>

        <div className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-black">
          {getApplicationPipelineStatusLabel(status)}
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-sm text-zinc-600">
        <div>
          <dt className="font-medium text-black">Current Employer</dt>
          <dd>{formatOptional(currentEmployer)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Location</dt>
          <dd>{formatOptional(location)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Experience</dt>
          <dd>{experienceYears} years</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Skills</dt>
          <dd>{formatOptional(skills)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Expected CTC</dt>
          <dd>{formatOptional(expectedCTC)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Source</dt>
          <dd>{getApplicationSourceLabel(source)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Expert Score</dt>
          <dd>{formatOptional(expertScore)}</dd>
        </div>
      </dl>

      {monitorNote ? (
        <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          {monitorNote}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
        {requirementHref && (
          <Link
            href={requirementHref}
            className="rounded-lg border border-black px-3 py-1.5 text-xs font-medium text-black hover:bg-zinc-100"
          >
            Open Requirement
          </Link>
        )}
        <Link
          href="/dashboard/applications"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-zinc-100"
        >
          Applications
        </Link>
        <Link
          href="/dashboard/evaluations"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-zinc-100"
        >
          Evaluations
        </Link>
      </div>

      {moveOptions.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Move to...
          </p>
          <div className="flex flex-col gap-2">
            {moveOptions.map((option) => (
              <button
                key={option.status}
                type="button"
                disabled={isMoving}
                onClick={() => onMove(id, option.status)}
                className={`
                  rounded-lg
                  px-3
                  py-2
                  text-left
                  text-sm
                  font-medium
                  transition
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                  ${
                    option.status === "REJECTED"
                      ? "border border-red-200 text-red-600 hover:bg-red-50"
                      : "border border-zinc-300 text-black hover:bg-zinc-100"
                  }
                `}
              >
                {isMoving ? "Moving..." : option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
