import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding",
};

import { redirect } from "next/navigation";
import Link from "next/link";

import AuthLayout from "@/components/auth/AuthLayout";
import SignOutLink from "@/components/auth/SignOutLink";
import {
  AuthenticationError,
  requirePostAuthDestination,
  requireUser,
} from "@/lib/auth/authorization";
import { findPendingInvitationsForEmail } from "@/lib/organizations/invitation-service";

export default async function OnboardingPage() {
  let destination: string;
  try {
    destination = await requirePostAuthDestination();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect("/login");
    }
    throw error;
  }

  if (destination !== "/onboarding") {
    redirect(destination);
  }

  const user = await requireUser();
  const pending = await findPendingInvitationsForEmail(user.email);

  return (
    <AuthLayout
      title="Set up your workspace"
      subtitle="Create a HireIQ company as owner, or join an existing company with an invitation."
    >
      {pending.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-700">
            You have a pending invitation to{" "}
            <span className="font-semibold">{pending[0].company.name}</span>.
            Open the invitation link from your email to join. HireIQ does not
            join companies from email domain alone.
          </p>
          <p className="text-sm text-zinc-600">
            If you did not receive the email, ask your company owner to resend
            the invitation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Link
            href="/onboarding/company"
            className="inline-flex w-full justify-center rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Create a company
          </Link>
          <p className="text-sm text-zinc-600">
            Already part of a HireIQ company? Ask your company owner for an
            invitation. Email domain is not used to join automatically.
          </p>
        </div>
      )}
      <div className="mt-6 text-right">
        <SignOutLink />
      </div>
    </AuthLayout>
  );
}
