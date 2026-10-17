"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Recommendation } from "@prisma/client";

import { selectClientCandidate } from "@/app/actions/application-actions";
import ClientRequirementNav from "@/components/client/ClientRequirementNav";
import ClientShortlistCard, {
  type ClientShortlistCardData,
} from "@/components/client/ClientShortlistCard";
import {
  clientJobStatusLabels,
  clientRecommendationLabels,
  clientRequirementLifecycleLabels,
  formatClientOptional,
  getClientFitDecisionLabel,
  getClientRecommendationLabel,
  getClientSourceLabel,
} from "@/components/client/client-labels";
import { jobAllowsClientHiringAction } from "@/lib/validation/application-pipeline";
import type { JobStatus, RequirementLifecycle } from "@prisma/client";

type RecommendationFilter =
  | "ALL"
  | "STRONG_HIRE"
  | "HIRE"
  | "NO_HIRE"
  | "STRONG_NO_HIRE";

type EvaluationFilter = "ALL" | "EVALUATED" | "NOT_EVALUATED";
type SortMode = "RECENT" | "OVERALL_SCORE";

export type ClientShortlistItem = Omit<
  ClientShortlistCardData,
  "compareSelected" | "onToggleCompare"
> & {
  updatedAt: string;
  evaluatedAt: string | null;
};

type ClientShortlistReviewProps = {
  requirement: {
    id: number;
    title: string;
    companyName: string;
    status: JobStatus;
    requirementLifecycle: RequirementLifecycle;
  };
  candidateCount: number;
  selectedCount: number;
  hiredCount: number;
  items: ClientShortlistItem[];
  canConfirmHire: boolean;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to select candidate. Please try again.";
}

function matchesShortlistSearch(item: ClientShortlistItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [
    item.name,
    item.role,
    item.currentEmployer,
    item.location,
    item.skills,
    item.jobTitle,
    item.companyName,
    getClientSourceLabel(item.source),
    item.interviewerName,
    getClientRecommendationLabel(item.recommendation),
    getClientFitDecisionLabel(item.fitDecision),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

const RECOMMENDATION_FILTERS: RecommendationFilter[] = [
  "ALL",
  "STRONG_HIRE",
  "HIRE",
  "NO_HIRE",
  "STRONG_NO_HIRE",
];

export default function ClientShortlistReview({
  requirement,
  candidateCount,
  selectedCount,
  hiredCount,
  items,
  canConfirmHire,
}: ClientShortlistReviewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [recommendationFilter, setRecommendationFilter] =
    useState<RecommendationFilter>("ALL");
  const [evaluationFilter, setEvaluationFilter] =
    useState<EvaluationFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("RECENT");
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [confirmingItem, setConfirmingItem] =
    useState<ClientShortlistItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (
        recommendationFilter !== "ALL" &&
        item.recommendation !== recommendationFilter
      ) {
        return false;
      }

      if (evaluationFilter === "EVALUATED" && !item.hasEvaluation) {
        return false;
      }

      if (evaluationFilter === "NOT_EVALUATED" && item.hasEvaluation) {
        return false;
      }

      return matchesShortlistSearch(item, search);
    });

    return [...filtered].sort((left, right) => {
      if (sortMode === "OVERALL_SCORE") {
        const leftScore = left.overallScore ?? -1;
        const rightScore = right.overallScore ?? -1;
        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }
      }

      const leftTime = new Date(
        left.evaluatedAt ?? left.updatedAt,
      ).getTime();
      const rightTime = new Date(
        right.evaluatedAt ?? right.updatedAt,
      ).getTime();
      return rightTime - leftTime;
    });
  }, [evaluationFilter, items, recommendationFilter, search, sortMode]);

  const compareItems = items.filter((item) =>
    compareIds.includes(item.applicationId),
  );

  function toggleCompare(applicationId: number) {
    setCompareIds((current) => {
      if (current.includes(applicationId)) {
        return current.filter((id) => id !== applicationId);
      }

      if (current.length >= 3) {
        return current;
      }

      return [...current, applicationId];
    });
  }

  function handleConfirmSelect() {
    if (!confirmingItem || isPending) {
      return;
    }

    const applicationId = confirmingItem.applicationId;
    setActionError(null);
    setSelectingId(applicationId);

    startTransition(async () => {
      try {
        await selectClientCandidate(applicationId);
        setConfirmingItem(null);
        router.refresh();
      } catch (error) {
        setActionError(getErrorMessage(error));
      } finally {
        setSelectingId(null);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Shortlist Review
          </p>
          <h1 className="mt-2 text-3xl font-bold text-black">
            {requirement.title}
          </h1>
          <p className="mt-2 text-zinc-600">{requirement.companyName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            Status: {clientJobStatusLabels[requirement.status]}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            Lifecycle:{" "}
            {
              clientRequirementLifecycleLabels[
                requirement.requirementLifecycle
              ]
            }
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            Shortlisted ·{" "}
            {items.filter((item) => item.status === "SHORTLISTED").length}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            Selected · {selectedCount}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
            Hired · {hiredCount}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        Interviewer recommendations appear as Shortlisted. Select a candidate,
        then confirm hire. Billing is generated only after hire is confirmed.
      </div>

      {actionError ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      ) : null}

      <ClientRequirementNav
        requirementId={requirement.id}
        candidateCount={candidateCount}
        shortlistedCount={items.length}
        active="shortlist"
      />

      {items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-lg font-medium text-black">
            No candidates have been shortlisted for this requirement yet.
          </p>
          <Link
            href={`/client/requirements/${requirement.id}?section=candidates`}
            className="mt-4 inline-flex rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Back to Candidates
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-4">
            <label
              htmlFor={`client-shortlist-search-${requirement.id}`}
              className="sr-only"
            >
              Search shortlisted candidates
            </label>
            <input
              id={`client-shortlist-search-${requirement.id}`}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search shortlisted candidates..."
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
            />

            <div className="flex flex-wrap gap-2">
              {RECOMMENDATION_FILTERS.map((filter) => {
                const label =
                  filter === "ALL"
                    ? "All recommendations"
                    : clientRecommendationLabels[filter as Recommendation];
                const isActive = recommendationFilter === filter;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setRecommendationFilter(filter)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      isActive
                        ? "bg-black text-white"
                        : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["ALL", "All evaluation"],
                  ["EVALUATED", "Evaluated"],
                  ["NOT_EVALUATED", "Not Evaluated"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEvaluationFilter(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    evaluationFilter === value
                      ? "bg-black text-white"
                      : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Sort
              </span>
              <button
                type="button"
                onClick={() => setSortMode("RECENT")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  sortMode === "RECENT"
                    ? "bg-black text-white"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                Recently evaluated
              </button>
              <button
                type="button"
                onClick={() => setSortMode("OVERALL_SCORE")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  sortMode === "OVERALL_SCORE"
                    ? "bg-black text-white"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                Overall score
              </button>
            </div>
          </div>

          {compareItems.length >= 2 ? (
            <section className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="text-lg font-bold text-black">Compare Candidates</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Read-only comparison of up to three shortlisted candidates.
              </p>
              <table className="mt-4 min-w-full text-left text-sm text-zinc-600">
                <thead className="bg-zinc-50 text-black">
                  <tr>
                    <th className="px-3 py-2 font-medium">Field</th>
                    {compareItems.map((item) => (
                      <th key={item.applicationId} className="px-3 py-2 font-medium">
                        {item.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Role", (item: ClientShortlistItem) => item.role],
                      [
                        "Experience",
                        (item: ClientShortlistItem) =>
                          `${item.experienceYears} years`,
                      ],
                      [
                        "Skills",
                        (item: ClientShortlistItem) =>
                          formatClientOptional(item.skills),
                      ],
                      [
                        "Expected CTC",
                        (item: ClientShortlistItem) =>
                          formatClientOptional(item.expectedCTC),
                      ],
                      [
                        "Expert Score",
                        (item: ClientShortlistItem) =>
                          formatClientOptional(item.expertScore),
                      ],
                      [
                        "Overall Score",
                        (item: ClientShortlistItem) =>
                          formatClientOptional(item.overallScore),
                      ],
                      [
                        "Recommendation",
                        (item: ClientShortlistItem) =>
                          getClientRecommendationLabel(item.recommendation),
                      ],
                      [
                        "Hire Probability",
                        (item: ClientShortlistItem) =>
                          formatClientOptional(item.hireProbability),
                      ],
                      [
                        "Fit Decision",
                        (item: ClientShortlistItem) =>
                          getClientFitDecisionLabel(item.fitDecision),
                      ],
                    ] as const
                  ).map(([label, getValue]) => (
                    <tr key={label} className="border-t border-zinc-200">
                      <td className="px-3 py-2 font-medium text-black">
                        {label}
                      </td>
                      {compareItems.map((item) => (
                        <td key={`${item.applicationId}-${label}`} className="px-3 py-2">
                          {getValue(item)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {filteredItems.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
              <p className="text-lg font-medium text-black">
                No shortlisted candidates match your search or filters.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {filteredItems.map((item) => (
                <ClientShortlistCard
                  key={item.applicationId}
                  canConfirmHire={canConfirmHire}
                  candidate={{
                    ...item,
                    compareSelected: compareIds.includes(item.applicationId),
                    onToggleCompare: () => toggleCompare(item.applicationId),
                    onSelectCandidate: () => {
                      setActionError(null);
                      setConfirmingItem(item);
                    },
                    isSelecting: selectingId === item.applicationId,
                    selectDisabled:
                      isPending ||
                      item.status !== "SHORTLISTED" ||
                      !jobAllowsClientHiringAction(
                        requirement.requirementLifecycle,
                      ),
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {confirmingItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="select-candidate-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2
              id="select-candidate-title"
              className="text-xl font-bold text-black"
            >
              Select this candidate?
            </h2>
            <p className="mt-3 text-sm text-zinc-600">
              Selecting <span className="font-medium text-black">{confirmingItem.name}</span>{" "}
              will mark them Selected. Billing is not generated until you confirm
              hire.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmingItem(null)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmSelect}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {isPending ? "Selecting..." : "Select Candidate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
