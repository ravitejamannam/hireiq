"use client";

import { useState } from "react";

import AuthButton from "./AuthButton";
import AuthInput from "./AuthInput";

export default function SignupForm() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSignup() {
    console.log("Company:", companyName);
    console.log("Email:", email);
    console.log("Password:", password);
  }

  return (
    <div className="space-y-5">
      <AuthInput
        label="Company Name"
        placeholder="Acme Inc."
        value={companyName}
        onChange={setCompanyName}
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
        placeholder="Create a password"
        value={password}
        onChange={setPassword}
      />

      <AuthButton label="Create Account" onClick={handleSignup} />

      <div className="text-center text-sm text-zinc-600">
        Already have an account?{" "}
        <a href="/login" className="font-medium text-black">
          Sign In
        </a>
      </div>
    </div>
  );
}
