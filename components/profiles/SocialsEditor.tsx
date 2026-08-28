"use client";

import { useMemo, useState } from "react";
import { GripVertical, Search } from "lucide-react";

import SocialPlatformMark from "@/components/profiles/SocialPlatformMark";
import {
  SOCIAL_PLATFORMS,
  applySocialRows,
  detectPlatformFromUrl,
  listSocialRows,
  normalizeProfileUrl,
  parseBulkSocialLinks,
  socialPlatformMeta,
  type ProfileSocialLink,
  type SocialPlatformId,
} from "@/lib/profiles/social-platforms";
import type { StructuredProfileDraft } from "@/lib/profiles/structured-profile";

type SocialsEditorProps = {
  draft: StructuredProfileDraft;
  onChange: (next: StructuredProfileDraft) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  inputClassName: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{message}</p>;
}

export default function SocialsEditor({
  draft,
  onChange,
  errors = {},
  disabled,
  inputClassName,
}: SocialsEditorProps) {
  const rows = listSocialRows(draft);
  const used = new Set(rows.map((row) => row.platform));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingUrl, setPendingUrl] = useState("");
  const [pendingPlatform, setPendingPlatform] = useState<SocialPlatformId | "">(
    "",
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SOCIAL_PLATFORMS.filter((item) => {
      if (used.has(item.id) && item.id !== "OTHER") return false;
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
    });
  }, [query, used]);

  function commit(next: ProfileSocialLink[]) {
    onChange({ ...draft, ...applySocialRows(next) });
  }

  function addRow(platform: SocialPlatformId, url = "") {
    if (used.has(platform) && platform !== "OTHER") {
      setPickerOpen(false);
      setPendingPlatform(platform);
      return;
    }
    commit([...rows, { platform, url }]);
    setPickerOpen(false);
    setQuery("");
    setPendingPlatform("");
    setPendingUrl("");
  }

  function addFromForm() {
    const url = normalizeProfileUrl(pendingUrl) ?? pendingUrl.trim();
    const detected = url ? detectPlatformFromUrl(url) : null;
    const platform = pendingPlatform || detected || "OTHER";
    addRow(platform, url);
  }

  function importBulk() {
    const imported = parseBulkSocialLinks(bulkText);
    if (imported.length === 0) return;
    const next = [...rows];
    for (const link of imported) {
      const existing = next.findIndex((row) => row.platform === link.platform);
      if (existing >= 0 && link.platform !== "OTHER") {
        next[existing] = link;
      } else {
        next.push(link);
      }
    }
    commit(next);
    setBulkText("");
    setBulkOpen(false);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-zinc-900">Social platforms</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Add public profiles. The hiring team sees them as icon buttons on your
          card — LinkedIn is stored as a URL (LinkedIn does not expose a public
          profile API).
        </p>
      ) : null}

      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li
            key={`${row.platform}-${index}`}
            className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-zinc-300" aria-hidden />
            <SocialPlatformMark platform={row.platform} className="h-4 w-4 shrink-0 text-zinc-800" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-900">
                {socialPlatformMeta(row.platform)?.label ?? row.platform}
              </p>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 outline-none focus:border-zinc-900"
                value={row.url}
                disabled={disabled}
                placeholder={socialPlatformMeta(row.platform)?.placeholder}
                onChange={(event) => {
                  commit(
                    rows.map((item, i) =>
                      i === index ? { ...item, url: event.target.value } : item,
                    ),
                  );
                }}
              />
              <FieldError
                message={
                  errors[`${row.platform.toLowerCase()}Url`] ||
                  errors[`socialLinks.${index}`] ||
                  errors[`socialLinks.${index}.url`]
                }
              />
            </div>
            <span className="hidden shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 sm:inline">
              Public
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => commit(rows.filter((_, i) => i !== index))}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-zinc-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Add a platform
        </p>
        <div className="relative mt-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPickerOpen((open) => !open)}
            className="flex w-full items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-left text-sm text-zinc-800"
          >
            {pendingPlatform ? (
              <>
                <SocialPlatformMark platform={pendingPlatform} className="h-4 w-4" />
                {socialPlatformMeta(pendingPlatform)?.label}
              </>
            ) : (
              <span className="text-zinc-400">Choose a platform</span>
            )}
          </button>
          {pickerOpen ? (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
              <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-zinc-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search platforms"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              <ul className="max-h-56 overflow-y-auto py-1">
                {available.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-stone-50"
                      onClick={() => {
                        setPendingPlatform(item.id);
                        setPickerOpen(false);
                        setQuery("");
                      }}
                    >
                      <SocialPlatformMark platform={item.id} className="h-4 w-4" />
                      {item.label}
                    </button>
                  </li>
                ))}
                {available.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-zinc-500">No matches</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium text-zinc-800">Profile URL</span>
          <input
            className={inputClassName}
            value={pendingUrl}
            disabled={disabled}
            placeholder="Enter username or profile URL"
            onChange={(event) => setPendingUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addFromForm();
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={disabled || (!pendingPlatform && !pendingUrl.trim())}
          onClick={addFromForm}
          className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Add social
        </button>
      </div>

      <div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setBulkOpen((open) => !open)}
          className="text-sm font-semibold text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
        >
          Bulk import links
        </button>
        {bulkOpen ? (
          <div className="mt-3 space-y-2">
            <textarea
              className={`${inputClassName} resize-y`}
              rows={4}
              value={bulkText}
              disabled={disabled}
              placeholder={"https://github.com/you\nhttps://linkedin.com/in/you"}
              onChange={(event) => setBulkText(event.target.value)}
            />
            <button
              type="button"
              disabled={disabled || !bulkText.trim()}
              onClick={importBulk}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Import
            </button>
          </div>
        ) : null}
      </div>
      <FieldError message={errors.socialLinks} />
    </div>
  );
}
