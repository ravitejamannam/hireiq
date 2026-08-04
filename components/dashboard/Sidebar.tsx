"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  Code2,
  BarChart3,
  Settings,
} from "lucide-react";
import link from "next/link";

const links = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/dashboard",
  },
  {
    icon: Building2,
    label: "Companies",
    href: "/dashboard/companies",
  },
  {
    icon: Users,
    label: "Candidates",
    href: "/dashboard/candidates",
  },
  {
    icon: Calendar,
    label: "Interviews",
    href: "/dashboard/interviews",
  },
  {
    icon: Code2,
    label: "Coding Tests",
    href: "/dashboard/coding-tests",
  },
  {
    icon: BarChart3,
    label: "Reports",
    href: "/dashboard/reports",
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="
    flex
    h-screen
    w-64
    flex-col
    border-r
    border-zinc-200
    bg-white
  "
    >
      <div className="border-b border-zinc-200 p-6">
        <h2 className="text-2xl font-bold text-black">HireIQ</h2>
      </div>

      <nav className="p-4">
        <ul className="space-y-2">
          {links.map((link) => {
            const isActive = pathname === link.href;

            return (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className={`
  flex
  w-full
  items-center
  gap-3
  rounded-lg
  px-4
  py-3
  font-medium
  transition-colors
  ${
    isActive
      ? "bg-black text-white"
      : "text-zinc-700 hover:bg-zinc-100 hover:text-black"
  }
`}
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

      <div className="mt-auto border-t border-zinc-200 p-4">
        <button
          className="
      flex
      w-full
      items-center
      gap-3
      rounded-lg
      px-4
      py-3
      text-left
      font-medium
      text-zinc-700
      transition
      hover:bg-zinc-100
      hover:translate-x-1
      hover:text-black
    "
        >
          <Settings size={18} className="text-zinc-600" />

          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
