"use client";

import Link from "next/link";

type ClientRequirementSection = "overview" | "candidates" | "shortlist";

type ClientRequirementNavProps = {
  requirementId: number;
  candidateCount: number;
  shortlistedCount: number;
  active: ClientRequirementSection;
  onSelectSection?: (section: "overview" | "candidates") => void;
};

function navClassName(isActive: boolean) {
  return `rounded-lg px-4 py-2 text-sm font-semibold transition ${
    isActive
      ? "bg-black text-white"
      : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
  }`;
}

export default function ClientRequirementNav({
  requirementId,
  candidateCount,
  shortlistedCount,
  active,
  onSelectSection,
}: ClientRequirementNavProps) {
  const basePath = `/client/requirements/${requirementId}`;

  return (
    <div className="mt-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
      {onSelectSection ? (
        <>
          <button
            type="button"
            onClick={() => onSelectSection("overview")}
            className={navClassName(active === "overview")}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => onSelectSection("candidates")}
            className={navClassName(active === "candidates")}
          >
            Candidates ({candidateCount})
          </button>
        </>
      ) : (
        <>
          <Link href={basePath} className={navClassName(active === "overview")}>
            Overview
          </Link>
          <Link
            href={`${basePath}?section=candidates`}
            className={navClassName(active === "candidates")}
          >
            Candidates ({candidateCount})
          </Link>
        </>
      )}
      <Link
        href={`${basePath}/shortlist`}
        className={navClassName(active === "shortlist")}
      >
        Shortlist · {shortlistedCount}
      </Link>
    </div>
  );
}
