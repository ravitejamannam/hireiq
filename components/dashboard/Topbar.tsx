"use client";

import { PortalRole } from "@prisma/client";
import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";

const portalRoleLabels: Record<PortalRole, string> = {
  ADMIN: "Admin",
  CLIENT: "Client",
  INTERVIEWER: "Interviewer",
};

export default function Topbar() {
  const { data: session } = useSession();
  const user = session?.user;
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-4 border-b border-stone-200/80 bg-[#FBF9F4]/85 px-4 backdrop-blur-xl sm:px-8 lg:justify-between">
      {/* Brand echo for mobile where the sidebar is hidden */}
      <p className="hidden text-sm font-semibold tracking-tight text-stone-400 lg:block">
        HireIQ
      </p>

      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-3 rounded-full border border-stone-200/80 bg-white py-1.5 pl-1.5 pr-2 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-black uppercase text-white">
              {initial}
            </span>
            <div className="pr-1 text-left leading-tight">
              <p className="text-xs font-bold text-stone-900">{user.name}</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                {portalRoleLabels[user.role]}
              </p>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            void signOut({ callbackUrl: "/login" });
          }}
          title="Sign out"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200/80 bg-white text-stone-500 shadow-sm transition hover:border-stone-300 hover:text-stone-900"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
