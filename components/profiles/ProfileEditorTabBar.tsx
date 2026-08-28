"use client";

import { Blocks, Share2, UserRound, Briefcase, GraduationCap, FolderKanban } from "lucide-react";

import type { ProfileEditorTab } from "@/components/profiles/StructuredProfileFields";
import { PROFILE_EDITOR_TABS } from "@/components/profiles/StructuredProfileFields";

const TAB_ICONS: Record<ProfileEditorTab, typeof Share2> = {
  basic: UserRound,
  experience: Briefcase,
  education: GraduationCap,
  projects: FolderKanban,
  socials: Share2,
  integrations: Blocks,
};

type ProfileEditorTabBarProps = {
  tab: ProfileEditorTab;
  onChange: (tab: ProfileEditorTab) => void;
  disabled?: boolean;
};

export default function ProfileEditorTabBar({
  tab,
  onChange,
  disabled,
}: ProfileEditorTabBarProps) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {PROFILE_EDITOR_TABS.map((item) => {
        const active = tab === item.id;
        const Icon = TAB_ICONS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(item.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            } disabled:opacity-50`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
