"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  JobStatus,
  RequirementLifecycle,
  RoleCategory,
} from "@prisma/client";

import {
  completeJobRequirement,
  updateClientRequirement,
} from "@/app/actions/job-actions";
import {
  clientJobStatusLabels,
  clientRequirementLifecycleLabels,
  formatClientDate,
  type ClientPipelineCounts,
} from "@/components/client/client-labels";

const roleCategoryOptions = [
  { value: "ENGINEERING", label: "Engineering" },
  { value: "SALES", label: "Sales" },
  { value: "DESIGN", label: "Design" },
  { value: "FINANCE", label: "Finance" },
] as const satisfies ReadonlyArray<{ value: RoleCategory; label: string }>;

const roleCategoryLabels: Record<RoleCategory, string> = {
  ENGINEERING: "Engineering",
  SALES: "Sales",
  DESIGN: "Design",
  FINANCE: "Finance",
};

export type ClientRequirementWorkspaceData = {
  id: number;
  title: string;
  companyName: string;
  status: JobStatus;
  requirementLifecycle: RequirementLifecycle;
  roleCategory: RoleCategory | null;
  experienceRange: string | null;
  location: string | null;
  compensationRange: string | null;
  targetHireDate: string | null;
  numberOfPositions: number | null;
  mustHaveRequirements: string | null;
  niceToHaveRequirements: string | null;
  jobDescription: string | null;
  evaluationCriteria: string | null;
  primarySkills: string | null;
  clientCompletedAt: string | null;
  applicationCount: number;
  pipelineCounts: ClientPipelineCounts;
};

type FormState = {
  title: string;
  roleCategory: RoleCategory | "";
  experienceRange: string;
  location: string;
  compensationRange: string;
  targetHireDate: string;
  numberOfPositions: string;
  mustHaveRequirements: string;
  niceToHaveRequirements: string;
  jobDescription: string;
  evaluationCriteria: string;
  primarySkills: string;
};

type ClientRequirementWorkspaceProps = {
  requirement: ClientRequirementWorkspaceData;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function formatDateInputValue(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toFormState(requirement: ClientRequirementWorkspaceData): FormState {
  return {
    title: requirement.title,
    roleCategory: requirement.roleCategory ?? "",
    experienceRange: requirement.experienceRange ?? "",
    location: requirement.location ?? "",
    compensationRange: requirement.compensationRange ?? "",
    targetHireDate: formatDateInputValue(requirement.targetHireDate),
    numberOfPositions:
      requirement.numberOfPositions === null ||
      requirement.numberOfPositions === undefined
        ? ""
        : String(requirement.numberOfPositions),
    mustHaveRequirements: requirement.mustHaveRequirements ?? "",
    niceToHaveRequirements: requirement.niceToHaveRequirements ?? "",
    jobDescription: requirement.jobDescription ?? "",
    evaluationCriteria: requirement.evaluationCriteria ?? "",
    primarySkills: requirement.primarySkills ?? "",
  };
}

function parseDraftFields(form: FormState) {
  return {
    roleCategory: form.roleCategory === "" ? null : form.roleCategory,
    experienceRange: form.experienceRange.trim() || null,
    location: form.location.trim() || null,
    compensationRange: form.compensationRange.trim() || null,
    targetHireDate: form.targetHireDate
      ? new Date(`${form.targetHireDate}T00:00:00.000Z`)
      : null,
    numberOfPositions: form.numberOfPositions.trim()
      ? Number(form.numberOfPositions)
      : null,
    mustHaveRequirements: form.mustHaveRequirements.trim() || null,
    niceToHaveRequirements: form.niceToHaveRequirements.trim() || null,
    jobDescription: form.jobDescription.trim() || null,
    evaluationCriteria: form.evaluationCriteria.trim() || null,
    primarySkills: form.primarySkills.trim() || null,
  };
}

function lifecycleGuidance(lifecycle: RequirementLifecycle) {
  switch (lifecycle) {
    case "REQUIREMENT_DRAFTED":
      return "Requirement is still being prepared.";
    case "CLIENT_NOTIFIED":
      return "Review and complete this requirement.";
    case "REQUIREMENT_POSTED":
      return "Requirement completed.";
    default:
      return "Requirement completed.";
  }
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  return String(value);
}

export default function ClientRequirementWorkspace({
  requirement,
}: ClientRequirementWorkspaceProps) {
  const router = useRouter();
  const [form, setForm] = useState(() => toFormState(requirement));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"draft" | "complete" | null>(
    null,
  );

  const isEditable = requirement.requirementLifecycle === "CLIENT_NOTIFIED";
  const isCompleted =
    requirement.requirementLifecycle === "REQUIREMENT_POSTED" ||
    requirement.requirementLifecycle === "INTERVIEWER_NOTIFIED" ||
    requirement.requirementLifecycle === "SOURCING_SHORTLISTING" ||
    requirement.requirementLifecycle === "BILLING_GENERATED";

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function handleSaveDraft() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyAction("draft");

    startTransition(async () => {
      try {
        await updateClientRequirement(
          requirement.id,
          form.title,
          parseDraftFields(form),
        );
        setSuccessMessage("Draft saved.");
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusyAction(null);
      }
    });
  }

  function handleComplete() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyAction("complete");

    startTransition(async () => {
      try {
        await updateClientRequirement(
          requirement.id,
          form.title,
          parseDraftFields(form),
        );
        await completeJobRequirement(requirement.id);
        setSuccessMessage("Requirement completed.");
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setBusyAction(null);
      }
    });
  }

  const inputClassName =
    "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-100";
  const textareaClassName = `${inputClassName} min-h-28 resize-y`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Requirement Workspace
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
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        {lifecycleGuidance(requirement.requirementLifecycle)}
        {requirement.clientCompletedAt ? (
          <span className="ml-2 text-zinc-500">
            Completed {formatClientDate(new Date(requirement.clientCompletedAt))}
          </span>
        ) : null}
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {successMessage}
        </div>
      ) : null}

      {isEditable ? (
        <form
          className="mt-8 space-y-8"
          onSubmit={(event) => {
            event.preventDefault();
            handleSaveDraft();
          }}
        >
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Role / Requirement</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="requirement-title"
                  className="block text-sm font-medium text-black"
                >
                  Title
                </label>
                <input
                  id="requirement-title"
                  value={form.title}
                  disabled={isPending}
                  onChange={(event) => updateField("title", event.target.value)}
                  className={inputClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="requirement-role-category"
                  className="block text-sm font-medium text-black"
                >
                  Role Category
                </label>
                <select
                  id="requirement-role-category"
                  value={form.roleCategory}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField(
                      "roleCategory",
                      event.target.value as RoleCategory | "",
                    )
                  }
                  className={inputClassName}
                >
                  <option value="">Select role category</option>
                  {roleCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="requirement-experience"
                  className="block text-sm font-medium text-black"
                >
                  Experience
                </label>
                <input
                  id="requirement-experience"
                  value={form.experienceRange}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("experienceRange", event.target.value)
                  }
                  className={inputClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="requirement-location"
                  className="block text-sm font-medium text-black"
                >
                  Location
                </label>
                <input
                  id="requirement-location"
                  value={form.location}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("location", event.target.value)
                  }
                  className={inputClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="requirement-compensation"
                  className="block text-sm font-medium text-black"
                >
                  Compensation
                </label>
                <input
                  id="requirement-compensation"
                  value={form.compensationRange}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("compensationRange", event.target.value)
                  }
                  className={inputClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="requirement-positions"
                  className="block text-sm font-medium text-black"
                >
                  Number of Positions
                </label>
                <input
                  id="requirement-positions"
                  type="number"
                  min={1}
                  step={1}
                  value={form.numberOfPositions}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("numberOfPositions", event.target.value)
                  }
                  className={inputClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="requirement-target-hire-date"
                  className="block text-sm font-medium text-black"
                >
                  Target Hire Date
                </label>
                <input
                  id="requirement-target-hire-date"
                  type="date"
                  value={form.targetHireDate}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("targetHireDate", event.target.value)
                  }
                  className={inputClassName}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Requirements</h2>
            <div className="mt-4 grid gap-4">
              <div>
                <label
                  htmlFor="requirement-primary-skills"
                  className="block text-sm font-medium text-black"
                >
                  Primary Skills
                </label>
                <textarea
                  id="requirement-primary-skills"
                  value={form.primarySkills}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("primarySkills", event.target.value)
                  }
                  className={textareaClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="requirement-must-have"
                  className="block text-sm font-medium text-black"
                >
                  Must Have
                </label>
                <textarea
                  id="requirement-must-have"
                  value={form.mustHaveRequirements}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("mustHaveRequirements", event.target.value)
                  }
                  className={textareaClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="requirement-nice-to-have"
                  className="block text-sm font-medium text-black"
                >
                  Nice To Have
                </label>
                <textarea
                  id="requirement-nice-to-have"
                  value={form.niceToHaveRequirements}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("niceToHaveRequirements", event.target.value)
                  }
                  className={textareaClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="requirement-job-description"
                  className="block text-sm font-medium text-black"
                >
                  Job Description
                </label>
                <textarea
                  id="requirement-job-description"
                  value={form.jobDescription}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("jobDescription", event.target.value)
                  }
                  className={textareaClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="requirement-evaluation-criteria"
                  className="block text-sm font-medium text-black"
                >
                  Evaluation Criteria
                </label>
                <textarea
                  id="requirement-evaluation-criteria"
                  value={form.evaluationCriteria}
                  disabled={isPending}
                  onChange={(event) =>
                    updateField("evaluationCriteria", event.target.value)
                  }
                  className={textareaClassName}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Client Action</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Review the requirement. Save a draft at any time, or complete it
              when all details are confirmed.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-60"
              >
                {busyAction === "draft" ? "Saving..." : "Save Draft"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleComplete}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
              >
                {busyAction === "complete"
                  ? "Completing..."
                  : "Complete Requirement"}
              </button>
            </div>
          </section>
        </form>
      ) : (
        <>
          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Role / Requirement</h2>
            <dl className="mt-4 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-black">Role Category</dt>
                <dd>
                  {requirement.roleCategory
                    ? roleCategoryLabels[requirement.roleCategory]
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Experience</dt>
                <dd>{displayValue(requirement.experienceRange)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Location</dt>
                <dd>{displayValue(requirement.location)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Compensation</dt>
                <dd>{displayValue(requirement.compensationRange)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Number of Positions</dt>
                <dd>{displayValue(requirement.numberOfPositions)}</dd>
              </div>
              <div>
                <dt className="font-medium text-black">Target Hire Date</dt>
                <dd>
                  {formatClientDate(
                    requirement.targetHireDate
                      ? new Date(requirement.targetHireDate)
                      : null,
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Requirements</h2>
            <dl className="mt-4 grid gap-4 text-sm text-zinc-600">
              <div>
                <dt className="font-medium text-black">Primary Skills</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.primarySkills)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Must Have</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.mustHaveRequirements)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Nice To Have</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.niceToHaveRequirements)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Job Description</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.jobDescription)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-black">Evaluation Criteria</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {displayValue(requirement.evaluationCriteria)}
                </dd>
              </div>
            </dl>
          </section>

          {isCompleted ? (
            <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
              <h2 className="text-lg font-bold text-black">Client Action</h2>
              <p className="mt-2 text-sm text-zinc-600">
                This requirement is complete and can no longer be edited.
              </p>
            </section>
          ) : null}
        </>
      )}

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-bold text-black">Pipeline summary</h2>
        {requirement.applicationCount === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">
            No candidates are currently in the recruitment pipeline.
          </p>
        ) : (
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm text-zinc-600 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="font-medium text-black">CV Pool</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {requirement.pipelineCounts.cvPool}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Expert Review</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {requirement.pipelineCounts.expertReview}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Tech Eval</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {requirement.pipelineCounts.techEvaluation}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Shortlisted</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {requirement.pipelineCounts.shortlisted}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Selected</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {requirement.pipelineCounts.selected}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-black">Hired</dt>
              <dd className="mt-1 text-2xl font-bold text-black">
                {requirement.pipelineCounts.hired}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
