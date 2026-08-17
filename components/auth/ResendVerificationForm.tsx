"use client";

import { useState } from "react";

import { resendVerificationEmail } from "@/app/actions/organization-actions";
import AuthButton from "./AuthButton";

export default function ResendVerificationForm() {
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleResend() {
    setMessage("");
    setIsError(false);
    setIsLoading(true);

    try {
      const result = await resendVerificationEmail();
      if (!result.ok) {
        setIsError(true);
        setMessage(result.error);
        return;
      }

      if (!result.sent) {
        setIsError(true);
        setMessage(
          "We couldn't send the email right now. Delivery is unavailable.",
        );
        return;
      }

      setMessage("A new verification email is on its way.");
    } catch {
      setIsError(true);
      setMessage("Too many attempts. Try again later.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p
          className={`text-sm ${isError ? "text-red-600" : "text-zinc-700"}`}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
      <AuthButton
        label="Resend verification email"
        onClick={() => {
          void handleResend();
        }}
        isLoading={isLoading}
        loadingLabel="Sending..."
      />
    </div>
  );
}
