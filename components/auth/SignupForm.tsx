"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { signUpClient } from "@/app/actions/signup-actions";
import AuthButton from "./AuthButton";
import AuthInput from "./AuthInput";

export default function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsLoading(true);

    try {
      const result = await signUpClient({ name, email, password });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      router.push("/post-auth");
      router.refresh();
    } catch {
      setFormError("Unable to create your account with those details.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <AuthInput
        label="Name"
        placeholder="Your name"
        value={name}
        onChange={setName}
      />
      <AuthInput
        label="Email"
        type="email"
        placeholder="you@company.com"
        value={email}
        onChange={setEmail}
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
        label="Create account"
        type="submit"
        isLoading={isLoading}
        loadingLabel="Creating account..."
      />

      <p className="text-center text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-black hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
