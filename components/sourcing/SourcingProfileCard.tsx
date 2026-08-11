import {
  ApplicationPipelineStatus,
  SourcingDatabaseSource,
} from "@prisma/client";

import {
  getApplicationPipelineStatusLabel,
  getApplicationSourceLabel,
} from "@/components/applications/ApplicationForm";

type SourcingProfileCardProps = {
  candidateName: string;
  role: string;
  currentEmployer: string | null;
  location: string | null;
  experienceYears: number;
  skills: string | null;
  expectedCTC: string | null;
  source: SourcingDatabaseSource | null;
  status: ApplicationPipelineStatus;
  expertScore: number | null;
};

export default function SourcingProfileCard({
  candidateName,
  role,
  currentEmployer,
  location,
  experienceYears,
  skills,
  expectedCTC,
  source,
  status,
  expertScore,
}: SourcingProfileCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-6 transition hover:border-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-black">{candidateName}</h3>
          <p className="mt-1 text-sm text-zinc-600">{role}</p>
        </div>
        <div className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-black">
          {getApplicationPipelineStatusLabel(status)}
        </div>
      </div>

      <dl className="mt-6 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-black">Current employer</dt>
          <dd>{currentEmployer || "Not provided"}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Location</dt>
          <dd>{location || "Not provided"}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Experience</dt>
          <dd>{experienceYears} years</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Expected CTC</dt>
          <dd>{expectedCTC || "Not provided"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-black">Skills</dt>
          <dd>{skills || "Not provided"}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Source</dt>
          <dd>{getApplicationSourceLabel(source)}</dd>
        </div>
        <div>
          <dt className="font-medium text-black">Expert score</dt>
          <dd>
            {expertScore === null || expertScore === undefined
              ? "Not evaluated"
              : expertScore}
          </dd>
        </div>
      </dl>
    </article>
  );
}
