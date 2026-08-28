"use client";

import { useState, type ReactNode } from "react";

import SocialPlatformMark from "@/components/profiles/SocialPlatformMark";
import {
  INTEGRATION_PROVIDERS,
  extraUrlForPlatform,
  integrationHandleFromUrl,
  upsertExtraSocial,
  urlFromIntegrationHandle,
  type IntegrationProviderId,
} from "@/lib/profiles/social-platforms";
import type { StructuredProfileDraft } from "@/lib/profiles/structured-profile";

type IntegrationsEditorProps = {
  draft: StructuredProfileDraft;
  onChange: (next: StructuredProfileDraft) => void;
  disabled?: boolean;
  inputClassName: string;
  extraSlot?: ReactNode;
};

function urlForProvider(draft: StructuredProfileDraft, id: IntegrationProviderId) {
  switch (id) {
    case "GITHUB":
      return draft.githubUrl;
    case "LEETCODE":
      return draft.leetcodeUrl;
    default:
      return extraUrlForPlatform(draft.socialLinks, id);
  }
}

export default function IntegrationsEditor({
  draft,
  onChange,
  disabled,
  inputClassName,
  extraSlot,
}: IntegrationsEditorProps) {
  const [editing, setEditing] = useState<IntegrationProviderId | null>(null);

  function setProviderUrl(id: IntegrationProviderId, url: string) {
    if (id === "GITHUB") {
      onChange({ ...draft, githubUrl: url });
      return;
    }
    if (id === "LEETCODE") {
      onChange({ ...draft, leetcodeUrl: url });
      return;
    }
    onChange({
      ...draft,
      socialLinks: upsertExtraSocial(draft.socialLinks, id, url),
    });
  }

  function applyHandle(id: IntegrationProviderId, handle: string) {
    setProviderUrl(id, handle.trim() ? urlFromIntegrationHandle(id, handle) : "");
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Third-party integrations</h3>
        <p className="mt-1 text-sm leading-relaxed text-zinc-600">
          Link public usernames. HireIQ reads public GitHub and LeetCode pages
          when the hiring team opens your profile. This is not OAuth and not a
          live ATS connection.
        </p>
      </div>
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200">
        {INTEGRATION_PROVIDERS.map((provider) => {
          const url = urlForProvider(draft, provider.id);
          const connected = Boolean(url.trim());
          const open = editing === provider.id || connected;
          return (
            <li key={provider.id} className="bg-white px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-zinc-800">
                  <SocialPlatformMark platform={provider.id} className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">{provider.label}</p>
                  <p className="text-xs text-zinc-500">{provider.description}</p>
                  {open ? (
                    <label className="mt-3 block">
                      <span className="text-xs font-medium text-zinc-700">Username</span>
                      <input
                        className={inputClassName}
                        value={integrationHandleFromUrl(provider.id, url)}
                        disabled={disabled}
                        placeholder={provider.placeholder}
                        onChange={(event) => applyHandle(provider.id, event.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
                {connected ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setProviderUrl(provider.id, "");
                      setEditing(null);
                    }}
                    className="relative h-5 w-9 shrink-0 rounded-full bg-emerald-600"
                    aria-label={`Disconnect ${provider.label}`}
                  >
                    <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setEditing(provider.id)}
                    className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-stone-50"
                  >
                    + Connect
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {extraSlot}
    </div>
  );
}
