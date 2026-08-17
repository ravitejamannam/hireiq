import Link from "next/link";
import { redirect } from "next/navigation";

import { acceptOrganizationInvitation } from "@/app/actions/organization-actions";
import AuthLayout from "@/components/auth/AuthLayout";
import InviteSignupForm from "@/components/auth/InviteSignupForm";
import { AuthenticationError } from "@/lib/auth/authorization";
import { previewInvitationByToken } from "@/lib/organizations/invitation-service";
import { OrganizationMembershipError } from "@/lib/validation/organization-membership-validation";

type InvitePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InviteAcceptPage({ params }: InvitePageProps) {
  const { token } = await params;

  let preview: { email: string; companyName: string; userExists: boolean };
  try {
    preview = await previewInvitationByToken(token);
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

  try {
    await acceptOrganizationInvitation(token);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      if (!preview.userExists) {
        return (
          <AuthLayout
            title={`Join ${preview.companyName}`}
            subtitle="Create your account with the invited email to continue."
          >
            <InviteSignupForm
              token={token}
              email={preview.email}
              companyName={preview.companyName}
            />
          </AuthLayout>
        );
      }

      const callbackUrl = `/invite/${encodeURIComponent(token)}`;
      return (
        <AuthLayout
          title="Sign in to accept"
          subtitle="This invitation requires a signed-in HireIQ account with the invited email."
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
      error instanceof OrganizationMembershipError
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

  redirect("/client");
}
