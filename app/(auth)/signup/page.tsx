import Link from "next/link";

import AuthLayout from "@/components/auth/AuthLayout";

export default function SignupPage() {
  return (
    <AuthLayout
      title="Account signup unavailable"
      subtitle="HireIQ accounts are provisioned by an administrator."
    >
      <p className="text-sm text-zinc-600">
        Contact your HireIQ admin if you need access. Existing users can sign
        in from the login page.
      </p>
      <div className="mt-6">
        <Link
          href="/login"
          className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Go to Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}
