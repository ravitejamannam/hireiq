"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Briefcase, LayoutDashboard } from "lucide-react";

type ClientSidebarProps = {
  companyName: string;
  userName: string;
};

const primaryLinks = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/client",
  },
];

const recruitmentLinks = [
  {
    icon: Briefcase,
    label: "Requirements",
    href: "/client/requirements",
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/client") {
    return pathname === "/client";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ClientSidebar({
  companyName,
  userName,
}: ClientSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-6">
        <h2 className="text-2xl font-bold text-black">HireIQ</h2>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Client
        </p>
        <p className="mt-3 text-sm font-semibold text-black">{companyName}</p>
        <p className="mt-1 text-sm text-zinc-600">{userName}</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-4" aria-label="Client navigation">
        <ul className="space-y-2">
          {primaryLinks.map((link) => {
            const isActive = isActivePath(pathname, link.href);

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 font-medium transition-colors ${
                    isActive
                      ? "bg-black text-white"
                      : "text-zinc-700 hover:bg-zinc-100 hover:text-black"
                  }`}
                >
                  <link.icon
                    size={18}
                    className={isActive ? "text-white" : "text-zinc-600"}
                  />
                  <span>{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-8">
          <p className="px-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Recruitment
          </p>
          <ul className="mt-2 space-y-2">
            {recruitmentLinks.map((link) => {
              const isActive = isActivePath(pathname, link.href);

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 font-medium transition-colors ${
                      isActive
                        ? "bg-black text-white"
                        : "text-zinc-700 hover:bg-zinc-100 hover:text-black"
                    }`}
                  >
                    <link.icon
                      size={18}
                      className={isActive ? "text-white" : "text-zinc-600"}
                    />
                    <span>{link.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-8">
          <p className="px-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Operations
          </p>
          <ul className="mt-2 space-y-2">
            <li>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Notifications will be available in a later release"
                className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 text-left font-medium text-zinc-400"
              >
                <span>Notifications</span>
                <span className="ml-auto text-xs font-normal">Soon</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <div className="border-t border-zinc-200 p-4">
        <button
          type="button"
          onClick={() => {
            void signOut({ callbackUrl: "/login" });
          }}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left font-medium text-zinc-700 transition hover:bg-zinc-100 hover:text-black"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
