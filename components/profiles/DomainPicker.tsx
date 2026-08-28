"use client";

import {
  PROFILE_DOMAINS,
  STRUCTURED_PROFILE_LIMITS,
} from "@/lib/profiles/structured-profile";

type DomainPickerProps = {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  error?: string;
};

export default function DomainPicker({
  value,
  onChange,
  disabled,
  error,
}: DomainPickerProps) {
  function toggle(domain: string) {
    if (disabled) return;
    if (value.includes(domain)) {
      onChange(value.filter((item) => item !== domain));
      return;
    }
    if (value.length >= STRUCTURED_PROFILE_LIMITS.domainMax) return;
    onChange([...value, domain]);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-zinc-800">Domains</span>
        <span className="text-xs text-zinc-400">
          Pick up to {STRUCTURED_PROFILE_LIMITS.domainMax}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {PROFILE_DOMAINS.map((domain) => {
          const selected = value.includes(domain);
          const atCap =
            !selected && value.length >= STRUCTURED_PROFILE_LIMITS.domainMax;
          return (
            <button
              key={domain}
              type="button"
              disabled={disabled || atCap}
              onClick={() => toggle(domain)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                selected
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 disabled:opacity-40"
              }`}
            >
              {domain}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
