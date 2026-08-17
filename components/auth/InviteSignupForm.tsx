"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signUpClientFromInvitation } from "@/app/actions/signup-actions";
import AuthButton from "./AuthButton";
import AuthInput from "./AuthInput";

type InviteSignupFormProps = {
  token: string;
  email: string;
  companyName: string;
};

export default function InviteSignupForm({
  token,
  email,
  companyName,
}: InviteSignupFormProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsLoading(true);

    try {
      const result = await signUpClientFromInvitation({
        token,
        name,
        password,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      router.push(`/invite/${encodeURIComponent(token)}`);
      router.refresh();
    } catch {
      setFormError("Unable to create your account with those details.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <p className="text-sm text-zinc-600">
        Create your HireIQ account to join {companyName}. The invited email
        cannot be changed.
      </p>
      <AuthInput
        label="Work email"
        type="email"
        placeholder="you@company.com"
        value={email}
        onChange={() => undefined}
        readOnly
        disabled
      />
      <AuthInput
        label="Name"
        placeholder="Your name"
        value={name}
        onChange={setName}
      />
      <AuthInput
        label="Password"
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
        label="Create account and join"
        type="submit"
        isLoading={isLoading}
        loadingLabel="Creating account..."
      />
    </form>
  );
}
