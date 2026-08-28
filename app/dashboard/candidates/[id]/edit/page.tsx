import Link from "next/link";
import { notFound } from "next/navigation";

import CandidateProfileForm from "@/components/candidates/CandidateProfileForm";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  AuthenticationError,
  AuthorizationError,
} from "@/lib/auth/authorization";
import { getCandidateProfilePageData } from "@/lib/candidates/candidate-profile-service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCandidateProfilePage({ params }: PageProps) {
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

  const { profile } = pageData;

  return (
    <DashboardLayout>
      <div className="mb-6">
        <Link
          href={`/dashboard/candidates/${candidateId}`}
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to profile page
        </Link>
        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">
          Edit candidate profile
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600">
          This form is only for the hiring team. Interviewers, clients, and
          admin read the published profile page — not this editor.
        </p>
      </div>
      <CandidateProfileForm profile={profile} />
    </DashboardLayout>
  );
}
