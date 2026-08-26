"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PortalRole } from "@prisma/client";
import { useSession } from "next-auth/react";

import {
  LayoutDashboard,
  Building2,
  Briefcase,
  UserCheck,
  Bell,
  CreditCard,
  Settings,
  Kanban,
  Search,
  ClipboardCheck,
  Code,
  ListChecks,
  Radio,
  Gauge,
  BarChart3,
} from "lucide-react";

const portalRoleLabels: Record<PortalRole, string> = {
  ADMIN: "Admin",
  CLIENT: "Client",
  INTERVIEWER: "Interviewer",
};

type NavLink = {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
  disabled?: boolean;
};

type NavSection = {
  title: string;
  links: NavLink[];
};

const primaryLinks: NavLink[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/dashboard",
  },
];

const sections: NavSection[] = [
  {
    title: "Workspace",
    links: [
      {
        icon: Briefcase,
        label: "Requirements",
        href: "/dashboard/requirements",
      },
      {
        icon: Building2,
        label: "Clients",
        href: "/dashboard/companies",
      },
      {
        icon: UserCheck,
        label: "Interviewers",
        href: "/dashboard/interviewers",
      },
    ],
  },
  {
    title: "Operations",
    links: [
      {
        icon: Search,
        label: "Sourcing",
        href: "/dashboard/sourcing",
      },
      {
        icon: Kanban,
        label: "Pipeline",
        href: "/dashboard/pipeline",
      },
      {
        icon: ClipboardCheck,
        label: "Expert Review",
        href: "/dashboard/expert-review",
      },
      {
        icon: Code,
        label: "Technical Evaluations",
        href: "/dashboard/technical-evaluations",
      },
      {
        icon: ListChecks,
        label: "Shortlist",
        href: "/dashboard/shortlist",
      },
      {
        icon: CreditCard,
        label: "Billing",
        href: "/dashboard/billing",
      },
      {
        icon: Bell,
        label: "Notifications",
        href: "/dashboard/notifications",
      },
      {
        icon: Radio,
        label: "Integrations",
        href: "/dashboard/integrations",
      },
      {
        icon: Gauge,
        label: "Calibration",
        href: "/dashboard/calibration",
      },
      {
        icon: BarChart3,
        label: "Analytics",
        href: "/dashboard/analytics",
      },
  {
    icon: Gauge,
    label: "Equity",
    href: "/dashboard/equity",
  },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  if (href === "/dashboard/requirements") {
    return (
      pathname === "/dashboard/requirements" ||
      pathname.startsWith("/dashboard/requirements/") ||
      pathname === "/dashboard/jobs" ||
      pathname.startsWith("/dashboard/jobs/")
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const roleLabel = session?.user?.role
    ? portalRoleLabels[session.user.role]
    : null;

  return (
    <>
      {/* Mobile top nav: horizontal scrolling chips */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-2 lg:hidden"
      >
        <Link href="/dashboard" className="mr-2 shrink-0 text-lg font-bold text-black">
          HireIQ
        </Link>
        {primaryLinks.concat(sections.flatMap((s) => s.links))
          .filter((l) => !l.disabled)
          .map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  pathname === link.href
                    ? "bg-black text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                <Icon size={14} aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}
      </nav>

      <aside className="hidden h-screen w-64 flex-col border-r border-zinc-200 bg-white lg:flex">
      <div className="border-b border-zinc-200 p-6">
        <h2 className="text-2xl font-bold text-black">HireIQ</h2>
        {roleLabel ? (
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            {roleLabel}
          </p>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto p-4" aria-label="Admin navigation">
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

        {sections.map((section) => (
          <div key={section.title} className="mt-8">
            <p className="px-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {section.title}
            </p>
            <ul className="mt-2 space-y-2">
              {section.links.map((link) => {
                if (link.disabled) {
                  return (
                    <li key={link.label}>
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Billing will be available in a later release"
                        className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 text-left font-medium text-zinc-400"
                      >
                        <link.icon size={18} className="text-zinc-400" />
                        <span>{link.label}</span>
                        <span className="ml-auto text-xs font-normal">Soon</span>
                      </button>
                    </li>
                  );
                }

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
        ))}
      </nav>

        <div className="mt-auto border-t border-zinc-200 p-4">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left font-medium text-zinc-700 transition hover:bg-zinc-100 hover:text-black"
          >
            <Settings size={18} className="text-zinc-600" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  );
}
