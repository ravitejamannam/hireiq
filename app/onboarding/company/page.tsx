import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Company",
};

import { redirect } from "next/navigation";

import AuthLayout from "@/components/auth/AuthLayout";
import SignOutLink from "@/components/auth/SignOutLink";
import CreateCompanyForm from "@/components/onboarding/CreateCompanyForm";
import {
  AuthenticationError,
  requirePostAuthDestination,
} from "@/lib/auth/authorization";

export default async function OnboardingCompanyPage() {
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

  return (
    <AuthLayout
      title="Create your company"
      subtitle="You will become the owner of this HireIQ workspace."
    >
      <CreateCompanyForm />
      <div className="mt-6 text-right">
        <SignOutLink />
      </div>
    </AuthLayout>
  );
}
