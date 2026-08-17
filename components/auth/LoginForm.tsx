"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PortalRole } from "@prisma/client";
import Link from "next/link";

import { homePathForRole } from "@/lib/auth/routes";
import AuthButton from "./AuthButton";
import AuthInput from "./AuthInput";

const GENERIC_AUTH_ERROR = "Invalid email or password.";

type LoginFormProps = {
  callbackUrl?: string | null;
};

export default function LoginForm({ callbackUrl }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let valid = true;

    setEmailError("");
    setPasswordError("");
    setFormError("");

    if (!email.trim()) {
      setEmailError("Email is required.");
      valid = false;
    }

    if (!password) {
      setPasswordError("Password is required.");
      valid = false;
    }

    if (!valid) return;

    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setFormError(GENERIC_AUTH_ERROR);
        return;
      }

      if (callbackUrl) {
        router.push(callbackUrl);
        router.refresh();
        return;
      }

      const sessionResponse = await fetch("/api/auth/session");
      const session = (await sessionResponse.json()) as {
        user?: { role?: PortalRole };
      };
      const role = session.user?.role ?? PortalRole.ADMIN;
      router.push(homePathForRole(role));
      router.refresh();
    } catch {
      setFormError(GENERIC_AUTH_ERROR);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleLogin}>
      <AuthInput
        label="Email"
        type="email"
        placeholder="you@company.com"
        value={email}
        onChange={setEmail}
        error={emailError}
      />

      <AuthInput
        label="Password"
        type="password"
        placeholder="Enter your password"
        value={password}
        onChange={setPassword}
        error={passwordError}
        showToggle
      />

      {formError ? (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      ) : null}

      <AuthButton label="Sign In" type="submit" isLoading={isLoading} />

      <div className="space-y-2 text-center text-sm text-zinc-600">
        <p>
          <Link href="/signup" className="font-medium text-black hover:underline">
            Create an account
          </Link>
        </p>
        <p>
          <Link
            href="/forgot-password"
            className="font-medium text-black hover:underline"
          >
            Forgot password?
          </Link>
        </p>
      </div>
    </form>
  );
}
