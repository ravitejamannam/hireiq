import AuthLayout from "@/components/auth/AuthLayout";
import AuthInput from "@/components/auth/AuthInput";

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
      </div>
    </AuthLayout>
  );
}