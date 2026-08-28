import { notFound } from "next/navigation";
import Link from "next/link";

import InterviewerPublicProfile from "@/components/interviewer/InterviewerPublicProfile";
import { AuthenticationError, AuthorizationError } from "@/lib/auth/authorization";
import { getInterviewerProfileForViewer } from "@/lib/interviewers/interviewer-profile-service";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClientInterviewerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const interviewerId = Number(id);
  if (!Number.isInteger(interviewerId) || interviewerId <= 0) {
    notFound();
  }

  let profile;
  try {
    profile = await getInterviewerProfileForViewer(interviewerId);
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      notFound();
    }
    throw error;
  }

  if (!profile) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/client/requirements"
          className="text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
        >
          ← Back to requirements
        </Link>
      </div>
      <InterviewerPublicProfile profile={profile} />
    </div>
  );
}
