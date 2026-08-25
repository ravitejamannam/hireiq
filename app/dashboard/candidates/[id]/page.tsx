import Link from "next/link";
import { notFound } from "next/navigation";

import CandidateEvidencePanel from "@/components/candidates/CandidateEvidencePanel";
import CandidateIdentityPanel from "@/components/candidates/CandidateIdentityPanel";
import CandidateIntelligencePanel from "@/components/candidates/CandidateIntelligencePanel";
import CandidateMatchingPanel from "@/components/candidates/CandidateMatchingPanel";
import CandidateProfileForm from "@/components/candidates/CandidateProfileForm";
import CandidateResumePanel from "@/components/candidates/CandidateResumePanel";
import CandidateSignalsPanel from "@/components/candidates/CandidateSignalsPanel";
import CandidateEraseButton from "@/components/candidates/CandidateEraseButton";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  formatClientDate,
  getClientPipelineStatusLabel,
  getClientSourceLabel,
} from "@/components/client/client-labels";
import {
  AuthenticationError,
  AuthorizationError,
} from "@/lib/auth/authorization";
import { getCandidateEvidence } from "@/lib/candidates/evidence/evidence-service";
import { getCandidateIdentity } from "@/lib/candidates/identity/identity-service";
import { getCandidateIntelligence } from "@/lib/candidates/intelligence/intelligence-service";
import { getCandidateMatching } from "@/lib/candidates/matching/matching-service";
import { getCandidateProfilePageData } from "@/lib/candidates/candidate-profile-service";

type CandidateProfilePageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CandidateProfilePage({
  params,
  searchParams,
}: CandidateProfilePageProps) {
  void searchParams;

  const { id } = await params;
  const candidateId = Number(id);
  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    notFound();
  }

  let pageData;
  try {
    pageData = await getCandidateProfilePageData(candidateId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      notFound();
    }
    throw error;
  }

  const { profile, applications } = pageData;

  let identity = null;
  try {
    identity = await getCandidateIdentity(candidateId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      identity = null;
    } else {
      throw error;
    }
  }

  let evidence = null;
  try {
    evidence = await getCandidateEvidence(candidateId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      evidence = null;
    } else {
      throw error;
    }
  }

  let intelligence = null;
  try {
    intelligence = await getCandidateIntelligence(candidateId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      intelligence = null;
    } else {
      throw error;
    }
  }

  let matching = null;
  try {
    matching = await getCandidateMatching(candidateId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      matching = null;
    } else {
      throw error;
    }
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/candidates"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to Candidates
        </Link>
        {candidateId ? (
          <div className="flex items-center gap-4">
            <a
              href={`/api/candidates/${candidateId}/export`}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
              title="Download all data held about this candidate (GDPR Art. 15)"
            >
              ⬇ Export candidate data (GDPR)
            </a>
            <CandidateEraseButton
              candidateId={candidateId}
              candidateName={profile.name}
            />
          </div>
        ) : null}
      </div>

      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
        Candidate
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">
        {profile.name}
      </h1>
      <p className="mt-2 text-zinc-600">
        {profile.headline ?? "Headline not provided"}
      </p>

      <div className="mt-8">
        <CandidateProfileForm profile={profile} />
      </div>

      {candidateId ? (
        <div className="mt-8">
          <CandidateResumePanel candidateId={candidateId} />
        </div>
      ) : null}

      {candidateId ? (
        <div className="mt-8">
          <CandidateSignalsPanel candidateId={candidateId} />
        </div>
      ) : null}


      {identity ? <CandidateIdentityPanel identity={identity} /> : null}

      {evidence ? <CandidateEvidencePanel evidence={evidence} /> : null}

      {intelligence ? (
        <CandidateIntelligencePanel
          candidateId={intelligence.candidateId}
          evidence={evidence ?? []}
          runs={intelligence.runs}
        />
      ) : null}

      {matching ? (
        <CandidateMatchingPanel
          candidateId={matching.candidateId}
          applications={matching.applications}
          runs={matching.runs}
        />
      ) : null}

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Applications</h2>
        {applications.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">
            No applications are associated with this candidate.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-zinc-600">
              <thead className="bg-zinc-50 text-black">
                <tr>
                  <th className="px-4 py-3 font-medium">Job</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Applied</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr
                    key={application.id}
                    className="border-t border-zinc-200"
                  >
                    <td className="px-4 py-3">{application.jobTitle}</td>
                    <td className="px-4 py-3">
                      {getClientPipelineStatusLabel(application.status)}
                    </td>
                    <td className="px-4 py-3">
                      {getClientSourceLabel(application.source)}
                    </td>
                    <td className="px-4 py-3">
                      {formatClientDate(application.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}
