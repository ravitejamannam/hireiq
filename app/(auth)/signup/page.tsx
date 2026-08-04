import AuthLayout from "@/components/auth/AuthLayout";

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start hiring better engineers today."
    >
      <p className="text-center text-zinc-500">Signup Form Goes Here</p>
    </AuthLayout>
  );
}