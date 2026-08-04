"use client";

import { useState } from "react";

type AuthInputProps = {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  showToggle?: boolean;
};

export default function AuthInput({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  showToggle,
}: AuthInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  return (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-black">
      {label}
    </label>

    <div className="relative">
      <input
        type={showToggle ? (showPassword ? "text" : "password") : type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="
          w-full
          rounded-xl
          border
          border-zinc-300
          bg-white
          px-4
          py-3
          pr-20
          text-black
          placeholder:text-zinc-400
          outline-none
          transition
          focus:border-black
        "
      />

      {showToggle && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-zinc-600 hover:text-black"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      )}
    </div>

    {error && (
      <p className="text-sm text-red-600">
        {error}
      </p>
    )}
  </div>
);
}