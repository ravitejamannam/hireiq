"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Briefcase,
  ClipboardList,
  LayoutDashboard,
  Users,
} from "lucide-react";

type InterviewerSidebarProps = {
  interviewerName: string;
  userName: string;
};

const links = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/interviewer",
  },
  {
    icon: Briefcase,
    label: "Requirements",
    href: "/interviewer/requirements",
  },
  {
    icon: Users,
    label: "Candidates",
    href: "/interviewer/candidates",
  },
  {
    icon: ClipboardList,
    label: "Evaluations",
    href: "/interviewer/evaluations",
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/interviewer") {
    return pathname === "/interviewer";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function InterviewerSidebar({
  interviewerName,
  userName,
}: InterviewerSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-6">
        <h2 className="text-2xl font-bold text-black">HireIQ</h2>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Interviewer
        </p>
        <p className="mt-3 text-sm font-semibold text-black">{interviewerName}</p>
        <p className="mt-1 text-sm text-zinc-600">{userName}</p>
      </div>

      <nav
        className="flex-1 overflow-y-auto p-4"
        aria-label="Interviewer navigation"
      >
        <ul className="space-y-2">
          {links.map((link) => {
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
      </nav>

      <div className="border-t border-zinc-200 p-4">
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/login" })}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
