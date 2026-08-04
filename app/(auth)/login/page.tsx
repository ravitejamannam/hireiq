import AuthLayout from "@/components/auth/AuthLayout";
import AuthInput from "@/components/auth/AuthInput";
import AuthButton from "@/components/auth/AuthButton";

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

        <AuthButton label="Sign In" />

        <div className="flex justify-between text-sm">
          <a
            href="#"
            className="text-zinc-600 hover:text-black"
          >
            Forgot password?
          </a>

          <a
            href="/signup"
            className="font-medium text-black"
          >
            Create account
          </a>
        </div>
      </div>
    </AuthLayout>
  );
}