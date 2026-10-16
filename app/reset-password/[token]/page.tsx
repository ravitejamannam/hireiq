import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password",
};

import AuthLayout from "@/components/auth/AuthLayout";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

type ResetPasswordPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ResetPasswordPage({
  params,
}: ResetPasswordPageProps) {
  const { token } = await params;

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="This link can be used once and then expires."
    >
      <ResetPasswordForm token={token} />
    </AuthLayout>
  );
}
