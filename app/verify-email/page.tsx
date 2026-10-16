import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify email",
};

import { redirect } from "next/navigation";
import Link from "next/link";

import AuthLayout from "@/components/auth/AuthLayout";
import ResendVerificationForm from "@/components/auth/ResendVerificationForm";
import SignOutLink from "@/components/auth/SignOutLink";
import {
  AuthenticationError,
  requirePostAuthDestination,
} from "@/lib/auth/authorization";

export default async function VerifyEmailPendingPage() {
  let destination: string;
  try {
    destination = await requirePostAuthDestination();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect("/login");
    }
    throw error;
  }

  if (destination !== "/verify-email") {
    redirect(destination);
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Check your inbox for a verification link before you can create or join a company."
    >
      <ResendVerificationForm />
      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/login" className="font-medium text-black hover:underline">
          Use a different account
        </Link>
        <SignOutLink />
      </div>
    </AuthLayout>
  );
}
