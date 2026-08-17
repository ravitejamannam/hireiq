"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { resetPassword } from "@/app/actions/password-reset-actions";
import AuthButton from "./AuthButton";
import AuthInput from "./AuthInput";

type ResetPasswordFormProps = {
  token: string;
};

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsLoading(true);

    try {
      const result = await resetPassword({ token, password });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setFormError("That reset link is invalid or has expired.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <AuthInput
        label="New password"
        type="password"
        placeholder="At least 8 characters"
        value={password}
        onChange={setPassword}
        showToggle
      />

      {formError ? (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      ) : null}

      <AuthButton
        label="Reset password"
        type="submit"
        isLoading={isLoading}
        loadingLabel="Saving..."
      />

      <p className="text-center text-sm text-zinc-600">
        <Link href="/login" className="font-medium text-black hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
