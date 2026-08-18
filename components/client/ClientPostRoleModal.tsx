"use client";

import { useState, type FormEvent } from "react";
import type { RoleCategory } from "@prisma/client";

import type { ClientRequirementEditableInput } from "@/app/actions/job-actions";

const roleCategoryOptions = [
  { value: "ENGINEERING", label: "Engineering" },
  { value: "SALES", label: "Sales" },
  { value: "DESIGN", label: "Design" },
  { value: "FINANCE", label: "Finance" },
] as const satisfies ReadonlyArray<{ value: RoleCategory; label: string }>;

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

const emptyForm: FormState = {
  title: "",
  roleCategory: "",
  experienceRange: "",
  location: "",
  compensationRange: "",
  targetHireDate: "",
  numberOfPositions: "",
  mustHaveRequirements: "",
  niceToHaveRequirements: "",
  jobDescription: "",
  evaluationCriteria: "",
  primarySkills: "",
};

export type ClientPostRolePayload = {
  title: string;
  fields: ClientRequirementEditableInput;
};

type ClientPostRoleModalProps = {
  isOpen: boolean;
  isSaving: boolean;
  errorMessage: string;
  onClose: () => void;
  onCreate: (payload: ClientPostRolePayload) => void;
};

function parseFields(form: FormState): ClientRequirementEditableInput {
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

const inputClassName =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:bg-zinc-50";
const textareaClassName = `${inputClassName} min-h-28`;

export default function ClientPostRoleModal({
  isOpen,
  isSaving,
  errorMessage,
  onClose,
  onCreate,
}: ClientPostRoleModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);

  if (!isOpen) return null;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      title: form.title,
      fields: parseFields(form),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Requirement / Post Role
            </p>
            <h2 className="mt-2 text-2xl font-bold text-black">
              Post a New Role
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              This posts the role for your company. All required fields must be
              complete.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close requirement form"
            onClick={onClose}
            className="text-2xl text-zinc-500 hover:text-black"
          >
            ×
          </button>
        </div>

        <form className="mt-8 space-y-8" onSubmit={handleSubmit}>
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h3 className="text-lg font-bold text-black">Role / Requirement</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="client-post-role-title"
                  className="block text-sm font-medium text-black"
                >
                  Title
                </label>
                <input
                  id="client-post-role-title"
                  value={form.title}
                  disabled={isSaving}
                  onChange={(event) => updateField("title", event.target.value)}
                  className={inputClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="client-post-role-category"
                  className="block text-sm font-medium text-black"
                >
                  Role Category
                </label>
                <select
                  id="client-post-role-category"
                  value={form.roleCategory}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField(
                      "roleCategory",
                      event.target.value as RoleCategory | "",
                    )
                  }
                  className={inputClassName}
                  required
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
                  htmlFor="client-post-role-experience"
                  className="block text-sm font-medium text-black"
                >
                  Experience
                </label>
                <input
                  id="client-post-role-experience"
                  value={form.experienceRange}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("experienceRange", event.target.value)
                  }
                  className={inputClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="client-post-role-location"
                  className="block text-sm font-medium text-black"
                >
                  Location
                </label>
                <input
                  id="client-post-role-location"
                  value={form.location}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("location", event.target.value)
                  }
                  className={inputClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="client-post-role-compensation"
                  className="block text-sm font-medium text-black"
                >
                  Compensation
                </label>
                <input
                  id="client-post-role-compensation"
                  value={form.compensationRange}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("compensationRange", event.target.value)
                  }
                  className={inputClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="client-post-role-positions"
                  className="block text-sm font-medium text-black"
                >
                  Number of Positions
                </label>
                <input
                  id="client-post-role-positions"
                  type="number"
                  min={1}
                  step={1}
                  value={form.numberOfPositions}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("numberOfPositions", event.target.value)
                  }
                  className={inputClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="client-post-role-hire-date"
                  className="block text-sm font-medium text-black"
                >
                  Target Hire Date
                </label>
                <input
                  id="client-post-role-hire-date"
                  type="date"
                  value={form.targetHireDate}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("targetHireDate", event.target.value)
                  }
                  className={inputClassName}
                  required
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h3 className="text-lg font-bold text-black">Requirements</h3>
            <div className="mt-4 grid gap-4">
              <div>
                <label
                  htmlFor="client-post-role-skills"
                  className="block text-sm font-medium text-black"
                >
                  Primary Skills
                </label>
                <textarea
                  id="client-post-role-skills"
                  value={form.primarySkills}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("primarySkills", event.target.value)
                  }
                  className={textareaClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="client-post-role-must-have"
                  className="block text-sm font-medium text-black"
                >
                  Must Have
                </label>
                <textarea
                  id="client-post-role-must-have"
                  value={form.mustHaveRequirements}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("mustHaveRequirements", event.target.value)
                  }
                  className={textareaClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="client-post-role-nice-to-have"
                  className="block text-sm font-medium text-black"
                >
                  Nice To Have
                </label>
                <textarea
                  id="client-post-role-nice-to-have"
                  value={form.niceToHaveRequirements}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("niceToHaveRequirements", event.target.value)
                  }
                  className={textareaClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="client-post-role-description"
                  className="block text-sm font-medium text-black"
                >
                  Job Description
                </label>
                <textarea
                  id="client-post-role-description"
                  value={form.jobDescription}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("jobDescription", event.target.value)
                  }
                  className={textareaClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="client-post-role-evaluation"
                  className="block text-sm font-medium text-black"
                >
                  Evaluation Criteria
                </label>
                <textarea
                  id="client-post-role-evaluation"
                  value={form.evaluationCriteria}
                  disabled={isSaving}
                  onChange={(event) =>
                    updateField("evaluationCriteria", event.target.value)
                  }
                  className={textareaClassName}
                  required
                />
              </div>
            </div>
          </section>

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-100 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {isSaving ? "Posting..." : "Post Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
