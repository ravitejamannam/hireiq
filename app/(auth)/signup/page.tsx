import AuthLayout from "@/components/auth/AuthLayout";
import AuthInput from "@/components/auth/AuthInput";
import AuthButton from "@/components/auth/AuthButton";

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start hiring better engineers today."
    >
      <div className="space-y-5">
        <AuthInput
          label="Company Name"
          placeholder="Acme Inc."
        />

        <AuthInput
          label="Email"
          type="email"
          placeholder="you@company.com"
        />

        <AuthInput
          label="Password"
          type="password"
          placeholder="Create a password"
        />

        <AuthButton label="Create Account" />

        <div className="text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <a
            href="/login"
            className="font-medium text-black"
          >
            Sign In
          </a>
        </div>
      </div>
    </AuthLayout>
  );
}