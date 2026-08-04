"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import AuthButton from "./AuthButton";
import AuthInput from "./AuthInput";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let valid = true;

    setEmailError("");

    setPasswordError("");

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

    setIsLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const fakeResponse = {
      success: email === "admin@hireiq.com" && password === "password123",
      message: "Login successful",
      user: {
        id: 1,
        email,
      },
      }

    setIsLoading(false);
    if (fakeResponse.success) {
        router.push("/dashboard");
    } else {
        alert("Invalid email or password. Please try again."); 
    }

    //console.log(fakeResponse);

    //console.log(email);

    //console.log(password);
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

      <AuthButton label="Sign In" type="submit" isLoading={isLoading}  />

      <div className="flex justify-between text-sm">
        <a href="#" className="text-zinc-600 hover:text-black">
          Forgot password?
        </a>

        <a href="/signup" className="font-medium text-black">
          Create account
        </a>
      </div>
    </form>
  );
}
