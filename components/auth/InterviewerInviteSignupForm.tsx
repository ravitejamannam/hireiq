"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import { signUpInterviewerFromInvitation } from "@/app/actions/interviewer-actions";
import AuthButton from "@/components/auth/AuthButton";
import AuthInput from "@/components/auth/AuthInput";

type InterviewerInviteSignupFormProps = {
  token: string;
  email: string;
  interviewerName: string;
};

export default function InterviewerInviteSignupForm({
  token,
  email,
  interviewerName,
}: InterviewerInviteSignupFormProps) {
  const [name, setName] = useState(interviewerName);
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsLoading(true);

    try {
      const result = await signUpInterviewerFromInvitation({
        token,
        name,
        password,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      const signedIn = await signIn("credentials", {
        email: result.email,
        password,
        redirect: false,
      });

      if (signedIn?.error) {
        router.push("/login");
        return;
      }

      router.push("/interviewer");
      router.refresh();
    } catch {
      setFormError("Unable to create your interviewer account.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <p className="text-sm text-zinc-600">
        Create your HireIQ interviewer login for {interviewerName}. The invited
        email cannot be changed.
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
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      ) : null}
      <AuthButton
        label="Create interviewer account"
        type="submit"
        isLoading={isLoading}
        loadingLabel="Creating account…"
      />
    </form>
  );
}
