import AuthLayout from "@/components/auth/AuthLayout";
import LoginForm from "@/components/auth/LoginForm";
import { safeInternalCallbackPath } from "@/lib/auth/routes";

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your HireIQ account."
    >
      <LoginForm callbackUrl={safeInternalCallbackPath(params.callbackUrl)} />
    </AuthLayout>
  );
}
