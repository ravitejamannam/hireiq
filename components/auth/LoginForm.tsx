"use client";

import { useState } from "react";

import AuthButton from "./AuthButton";
import AuthInput from "./AuthInput";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleLogin() {
    console.log("Email:", email);
    console.log("Password:", password);
  }

  return (
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

      <AuthButton
        label="Sign In"
        onClick={handleLogin}
      />

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
  );
}