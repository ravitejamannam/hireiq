"use client";

import { useState } from "react";

import AuthLayout from "@/components/auth/AuthLayout";
import AuthInput from "@/components/auth/AuthInput";
import AuthButton from "@/components/auth/AuthButton";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleLogin() {
    console.log("Email:", email);
    console.log("Password:", password);
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your HireIQ account."
    >
      <div className="space-y-5">
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
          placeholder="Enter your password"
          value={password}
          onChange={setPassword}
        />

        <div onClick={handleLogin}>
          <AuthButton label="Sign In" />
        </div>

        <div className="flex justify-between text-sm">
          <a
            href="#"
            className="text-zinc-600 hover:text-black"
          >
            Forgot password?
          </a>

          <a
            href="/signup"
            className="font-medium text-black"
          >
            Create account
          </a>
        </div>
      </div>
    </AuthLayout>
  );
}