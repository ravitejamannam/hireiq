"use client";

import { useState } from "react";
import Link from "next/link";

import { requestPasswordReset } from "@/app/actions/password-reset-actions";
import AuthButton from "./AuthButton";
import AuthInput from "./AuthInput";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const result = await requestPasswordReset(email);
      setMessage(result.message);
    } catch {
      setMessage(
        "If an account exists for this email, you'll receive instructions.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <AuthInput
        label="Email"
        type="email"
        placeholder="you@company.com"
        value={email}
        onChange={setEmail}
      />

      {message ? (
        <p className="text-sm text-zinc-700" role="status">
          {message}
        </p>
      ) : null}

      <AuthButton
        label="Send reset instructions"
        type="submit"
        isLoading={isLoading}
        loadingLabel="Sending..."
      />

      <p className="text-center text-sm text-zinc-600">
        <Link href="/login" className="font-medium text-black hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
