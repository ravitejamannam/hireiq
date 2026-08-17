import AuthLayout from "@/components/auth/AuthLayout";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="If an account exists for this email, you'll receive instructions."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
