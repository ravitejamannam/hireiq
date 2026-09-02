"use client";

import { useId, useState } from "react";

type AuthInputProps = {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  showToggle?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
};

export default function AuthInput({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  showToggle,
  disabled,
  readOnly,
}: AuthInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = useId();
  return (
  <div className="space-y-2">
    <label htmlFor={inputId} className="block text-sm font-medium text-black">
      {label}
    </label>

    <div className="relative">
      <input
        id={inputId}
        type={showToggle ? (showPassword ? "text" : "password") : type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        readOnly={readOnly}
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
          focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100
          disabled:cursor-not-allowed
          disabled:bg-zinc-50
          disabled:text-zinc-500
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