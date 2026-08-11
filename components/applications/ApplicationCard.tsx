import type {
  ApplicationPipelineStatus,
  SourcingDatabaseSource,
} from "@prisma/client";
import {
  getApplicationPipelineStatusLabel,
  getApplicationSourceLabel,
} from "@/components/applications/ApplicationForm";

type ApplicationCardProps = {
  id: number;
  candidateName: string;
  candidateRole: string;
  candidateExperienceYears: number;
  currentEmployer: string | null;
  location: string | null;
  skills: string | null;
  expectedCTC: string | null;
  jobTitle: string;
  companyName: string;
  status: ApplicationPipelineStatus;
  source: SourcingDatabaseSource | null;
  expertScore: number | null;
  rejectionReason: string | null;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "Not provided";
  }

  return value;
}

export default function ApplicationCard({
  id,
  candidateName,
  candidateRole,
  candidateExperienceYears,
  currentEmployer,
  location,
  skills,
  expectedCTC,
  jobTitle,
  companyName,
  status,
  source,
  expertScore,
  rejectionReason,
  onEdit,
  onDelete,
}: ApplicationCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-black">{candidateName}</h3>

          <p className="mt-1 text-zinc-500">{candidateRole}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {jobTitle} - {companyName}
          </p>
        </div>

        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {getApplicationPipelineStatusLabel(status)}
        </div>
      </div>

      <dl className="mt-6 grid gap-4 text-sm text-zinc-600">
        <div>
          <dt className="font-medium text-black">Experience</dt>
          <dd>{candidateExperienceYears} years</dd>
        </div>

        <div>
          <dt className="font-medium text-black">Current Employer</dt>
          <dd>{formatOptional(currentEmployer)}</dd>
        </div>

        <div>
          <dt className="font-medium text-black">Location</dt>
          <dd>{formatOptional(location)}</dd>
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

        <div>
          <dt className="font-medium text-black">Rejection Reason</dt>
          <dd>{formatOptional(rejectionReason)}</dd>
        </div>
      </dl>

      <div className="mt-8 border-t border-zinc-200 pt-4">
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onEdit(id)}
            className="
              rounded-lg
              border
              border-zinc-300
              px-4
              py-2
              text-sm
              font-medium
              text-black
              hover:bg-zinc-100
            "
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => onDelete(id)}
            className="
              rounded-lg
              border
              border-red-200
              px-4
              py-2
              text-sm
              font-medium
              text-red-600
              transition
              hover:bg-red-50
            "
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
