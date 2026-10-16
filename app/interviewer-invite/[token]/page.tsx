import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Interviewer invite",
};

import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalRole } from "@prisma/client";

import { acceptInterviewerInvite } from "@/app/actions/interviewer-actions";
import AuthLayout from "@/components/auth/AuthLayout";
import InterviewerInviteSignupForm from "@/components/auth/InterviewerInviteSignupForm";
import { AuthenticationError } from "@/lib/auth/authorization";
import { InterviewerInvitationError } from "@/lib/interviewers/interviewer-invitation-errors";
import { previewInterviewerInvitationByToken } from "@/lib/interviewers/interviewer-invitation-service";

type InterviewerInvitePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InterviewerInviteAcceptPage({
  params,
}: InterviewerInvitePageProps) {
  const { token } = await params;

  let preview: {
    email: string;
    interviewerName: string;
    userExists: boolean;
    existingRole: PortalRole | null;
    existingInterviewerId: number | null;
  };

  try {
    preview = await previewInterviewerInvitationByToken(token);
  } catch {
    return (
      <AuthLayout
        title="Invitation unavailable"
        subtitle="That invitation is invalid or can no longer be used."
      >
        <Link
          href="/login"
          className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Go to Sign In
        </Link>
      </AuthLayout>
    );
  }

  if (
    preview.userExists &&
    preview.existingRole !== null &&
    preview.existingRole !== PortalRole.INTERVIEWER
  ) {
    return (
      <AuthLayout
        title="Invitation unavailable"
        subtitle="This email already belongs to a HireIQ account that cannot become an interviewer."
      >
        <Link
          href="/login"
          className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Go to Sign In
        </Link>
      </AuthLayout>
    );
  }

  if (!preview.userExists) {
    return (
      <AuthLayout
        title={`Join as ${preview.interviewerName}`}
        subtitle="Create your interviewer account with the invited email."
      >
        <InterviewerInviteSignupForm
          token={token}
          email={preview.email}
          interviewerName={preview.interviewerName}
        />
      </AuthLayout>
    );
  }

  try {
    await acceptInterviewerInvite(token);
    redirect("/interviewer");
  } catch (error) {
    if (error instanceof AuthenticationError) {
      const callbackUrl = `/interviewer-invite/${encodeURIComponent(token)}`;
      return (
        <AuthLayout
          title="Sign in to accept"
          subtitle="This invitation requires a signed-in interviewer account with the invited email."
        >
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Go to Sign In
          </Link>
        </AuthLayout>
      );
    }

    const message =
      error instanceof InterviewerInvitationError
        ? error.message
        : "That invitation is invalid or can no longer be used.";

    return (
      <AuthLayout title="Invitation unavailable" subtitle={message}>
        <Link
          href="/login"
          className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Go to Sign In
        </Link>
      </AuthLayout>
    );
  }
}
