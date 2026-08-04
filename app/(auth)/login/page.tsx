import AuthLayout from "@/components/auth/AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your HireIQ account."
    >
      <p className="text-center text-zinc-500">Login Form Goes Here</p>
    </AuthLayout>
  );
}