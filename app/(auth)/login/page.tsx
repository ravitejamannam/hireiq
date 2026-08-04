import AuthLayout from "@/components/auth/AuthLayout";
import AuthInput from "@/components/auth/AuthInput";

export default function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your HireIQ account."
    >
      <div className="space-y-5">
        <AuthInput
          label="Email"
          type="email"
          placeholder="you@company.com"
        />

        <AuthInput
          label="Password"
          type="password"
          placeholder="Enter your password"
        />
      </div>
    </AuthLayout>
  );
}