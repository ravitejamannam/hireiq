"use client";

import { useState } from "react";

import AuthButton from "./AuthButton";
import AuthInput from "./AuthInput";

export default function SignupForm() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyError, setCompanyError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  function handleSignup() {
    let valid = true;

    setCompanyError("");
    setEmailError("");
    setPasswordError("");

    if (!companyName) {
      setCompanyError("Company name is required.");
      valid = false;
    }

    if (!email) {
      setEmailError("Email is required.");
      valid = false;
    }

    if (!password) {
      setPasswordError("Password is required.");
      valid = false;
    }

    if (password && password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      valid = false;
    }

    if (!valid) return;

    console.log(companyName);
    console.log(email);
    console.log(password);
  }

  return (
    <div className="space-y-5">
      <AuthInput
        label="Company Name"
        placeholder="Acme Inc."
        value={companyName}
        onChange={setCompanyName}
        error={companyError}
      />

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
        placeholder="Create a password"
        value={password}
        onChange={setPassword}
        error={passwordError}
        showToggle
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
