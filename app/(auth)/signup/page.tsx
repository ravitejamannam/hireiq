import AuthLayout from "@/components/auth/AuthLayout";
import SignupForm from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your HireIQ account"
      subtitle="Verify your email, then create a company or join one by invitation."
    >
      <SignupForm />
    </AuthLayout>
  );
}
