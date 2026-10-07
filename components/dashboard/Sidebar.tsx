"use client";

import Link from "next/link";

import HireIqLogo from "@/components/brand/HireIqLogo";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
  BarChart3,
  Gauge,
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

  // T141: collapsible sidebar. Persisted per browser; defaults to open.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // Reading a browser-only preference post-mount is the correct
    // SSR-safe pattern here; the cascading-render heuristic doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem("hireiq-sidebar-collapsed") === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("hireiq-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // storage unavailable — state still toggles for this session
      }
      return next;
    });
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        title="Open sidebar"
        aria-label="Open sidebar"
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200/80 bg-white text-stone-600 shadow-md transition hover:border-stone-300 hover:text-stone-900"
      >
        <PanelLeftOpen size={18} />
      </button>
    );
  }

  return (
    <>
      {/* Mobile top nav: horizontal scrolling chips */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 overflow-x-auto border-b border-stone-200/80 bg-[#FBF9F4]/95 px-3 py-2 backdrop-blur lg:hidden"
      >
        <Link href="/dashboard" aria-label="HireIQ" className="mr-2 shrink-0">
          <HireIqLogo markSize={28} />
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

      <aside className="hidden h-screen w-64 flex-col border-r border-stone-200/80 bg-[#FBF9F4] lg:flex">
      <div className="border-b border-stone-200/80 px-5 py-5">
        <div className="flex items-start justify-between">
        <Link href="/dashboard" aria-label="HireIQ" className="block">
          <HireIqLogo markSize={32} />
          {roleLabel ? (
            <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-indigo-600">
              {roleLabel} portal
            </p>
          ) : null}
        </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="rounded-lg p-1.5 text-stone-400 transition hover:bg-white hover:text-stone-700"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        <ul className="space-y-1">
          {primaryLinks.map((link) => {
            const isActive = isActivePath(pathname, link.href);

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-stone-900 text-[#FBF9F4] shadow-sm"
                      : "text-stone-600 hover:bg-white hover:text-stone-900"
                  }`}
                >
                  <link.icon
                    size={17}
                    className={isActive ? "text-[#FBF9F4]" : "text-stone-400"}
                  />
                  <span>{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {sections.map((section) => (
          <div key={section.title} className="mt-8">
            <p className="px-3.5 text-[11px] font-bold uppercase tracking-widest text-stone-400">
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
                        className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-stone-300"
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

        <div className="mt-auto border-t border-stone-200/80 p-3">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-stone-600 transition hover:bg-white hover:text-stone-900"
          >
            <Settings size={18} className="text-zinc-600" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  );
}
