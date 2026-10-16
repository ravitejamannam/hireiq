import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify email",
};

import Link from "next/link";
import { redirect } from "next/navigation";

import { verifyEmailAddress } from "@/app/actions/organization-actions";
import AuthLayout from "@/components/auth/AuthLayout";
import {
  AuthenticationError,
  requirePostAuthDestination,
} from "@/lib/auth/authorization";
import { OrganizationMembershipError } from "@/lib/validation/organization-membership-validation";

type VerifyEmailPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function VerifyEmailTokenPage({
  params,
}: VerifyEmailPageProps) {
  const { token } = await params;

  try {
    await verifyEmailAddress(token);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      const callbackUrl = `/verify-email/${encodeURIComponent(token)}`;
      return (
        <AuthLayout
          title="Sign in to verify"
          subtitle="Email verification requires a signed-in HireIQ account."
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
        : "This verification link cannot be used.";

    return (
      <AuthLayout title="Verification unavailable" subtitle={message}>
        <Link
          href="/login"
          className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Go to Sign In
        </Link>
      </AuthLayout>
    );
  }

  redirect(await requirePostAuthDestination());
}
