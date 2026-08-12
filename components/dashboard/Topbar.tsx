"use client";

import { PortalRole } from "@prisma/client";
import { signOut, useSession } from "next-auth/react";

const portalRoleLabels: Record<PortalRole, string> = {
  ADMIN: "Admin",
  CLIENT: "Client",
  INTERVIEWER: "Interviewer",
};

export default function Topbar() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-8">
      <h1 className="text-2xl font-bold text-black">Dashboard</h1>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="text-right">
            <p className="text-sm font-semibold text-black">{user.name}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {portalRoleLabels[user.role]}
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            void signOut({ callbackUrl: "/login" });
          }}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-zinc-100"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
