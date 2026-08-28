"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { JobStatus, RoleCategory } from "@prisma/client";

import JobPostingDetail, {
  employmentTypeBadgeClass,
} from "@/components/jobs/JobPostingDetail";
import {
  clientJobStatusLabels,
  formatRelativePosted,
} from "@/components/client/client-labels";
import {
  resolveJobPostingView,
  type JobPostingView,
} from "@/lib/jobs/job-posting-view";

export type RequirementBoardItem = {
  id: number;
  title: string;
  companyName: string;
  companyIndustry?: string | null;
  companyEmployees?: number | null;
  location: string | null;
  status: JobStatus;
  roleCategory: RoleCategory | null;
  experienceRange: string | null;
  numberOfPositions: number | null;
  compensationRange: string | null;
  jobDescription: string | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  primarySkills: string | null;
  structuredPayload?: unknown;
  createdAt: Date | string;
  href: string;
  listMeta?: string;
};

type RequirementBoardProps = {
  items: RequirementBoardItem[];
  emptyTitle: string;
  emptyBody?: string;
  searchPlaceholder?: string;
  extraFilters?: ReactNode;
  detailFooter?: (item: RequirementBoardItem, view: JobPostingView) => ReactNode;
};

export default function RequirementBoard({
  items,
  emptyTitle,
  emptyBody,
  searchPlaceholder = "Search by role, company, or location...",
  extraFilters,
  detailFooter,
}: RequirementBoardProps) {
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<"ALL" | JobStatus>("ALL");
  const [selectedId, setSelectedId] = useState<number | null>(
    items[0]?.id ?? null,
  );

  const views = useMemo(() => {
    const map = new Map<number, JobPostingView>();
    for (const item of items) {
      map.set(
        item.id,
        resolveJobPostingView(
          {
            title: item.title,
            companyName: item.companyName,
            companyIndustry: item.companyIndustry,
            companyEmployees: item.companyEmployees,
            location: item.location,
            experienceRange: item.experienceRange,
            numberOfPositions: item.numberOfPositions,
            compensationRange: item.compensationRange,
            jobDescription: item.jobDescription,
            mustHaveRequirements: item.mustHaveRequirements,
            niceToHaveRequirements: item.niceToHaveRequirements,
            primarySkills: item.primarySkills,
            structuredPayload: item.structuredPayload,
          },
          formatRelativePosted(item.createdAt),
        ),
      );
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusTab !== "ALL" && item.status !== statusTab) return false;
      const view = views.get(item.id);
      if (!q) return true;
      const haystack = [
        item.title,
        view?.title,
        item.companyName,
        item.location,
        view?.aboutRole,
        view?.employmentTypeLabel,
        clientJobStatusLabels[item.status],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search, statusTab, views]);

  const selected =
    filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const selectedView = selected ? views.get(selected.id) ?? null : null;

  const tabs: Array<{ id: "ALL" | JobStatus; label: string; count: number }> = [
    { id: "ALL", label: "All jobs", count: items.length },
    {
      id: "OPEN",
      label: "Open",
      count: items.filter((item) => item.status === "OPEN").length,
    },
    {
      id: "CLOSED",
      label: "Closed",
      count: items.filter((item) => item.status === "CLOSED").length,
    },
  ];

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
        <p className="text-lg font-medium text-black">{emptyTitle}</p>
        {emptyBody ? (
          <p className="mt-2 text-sm text-zinc-500">{emptyBody}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const active = statusTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusTab(tab.id);
                setSelectedId(null);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-black text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-black"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
        {extraFilters}
      </div>

      <div className="mt-4">
        <label htmlFor="requirement-board-search" className="sr-only">
          Search jobs
        </label>
        <input
          id="requirement-board-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">No matching jobs</p>
          <p className="mt-2 text-sm text-zinc-500">
            Try a different role title, location, or status.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid min-h-[560px] overflow-hidden rounded-2xl border border-zinc-200 bg-white lg:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.35fr)]">
          <div className="border-b border-zinc-200 lg:border-b-0 lg:border-r">
            <div className="hidden grid-cols-[minmax(0,1fr)_88px_72px] gap-3 border-b border-zinc-100 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 sm:grid">
              <span>Role</span>
              <span>Type</span>
              <span>Posted</span>
            </div>
            <ul className="max-h-[75vh] overflow-y-auto">
              {filtered.map((item) => {
                const view = views.get(item.id);
                const active = selected?.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`grid w-full grid-cols-1 gap-1 px-4 py-4 text-left transition sm:grid-cols-[minmax(0,1fr)_88px_72px] sm:items-center sm:gap-3 ${
                        active
                          ? "bg-zinc-50 ring-1 ring-inset ring-zinc-900/10"
                          : "hover:bg-zinc-50"
                      }`}
                    >
                      <span>
                        <span className="block font-semibold text-black">
                          {view?.title ?? item.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {item.companyName}
                          {item.location ? ` · ${item.location}` : ""}
                        </span>
                        {item.listMeta ? (
                          <span className="mt-1 block text-xs text-zinc-400">
                            {item.listMeta}
                          </span>
                        ) : null}
                      </span>
                      <span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            view
                              ? employmentTypeBadgeClass(view.employmentType)
                              : "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {view?.employmentTypeLabel ??
                            clientJobStatusLabels[item.status]}
                        </span>
                      </span>
                      <span className="text-xs text-zinc-500">
                        {formatRelativePosted(item.createdAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {selected && selectedView ? (
            <div className="max-h-[75vh] overflow-y-auto p-6">
              <JobPostingDetail
                view={selectedView}
                headerRight={
                  <Link
                    href={selected.href}
                    className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                  >
                    Open requirement
                  </Link>
                }
              />
              {detailFooter ? (
                <div className="mt-6 border-t border-zinc-100 pt-4">
                  {detailFooter(selected, selectedView)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
