"use client";

import type { ReactNode } from "react";

import DomainPicker from "@/components/profiles/DomainPicker";
import IntegrationsEditor from "@/components/profiles/IntegrationsEditor";
import SocialsEditor from "@/components/profiles/SocialsEditor";
import {
  STRUCTURED_PROFILE_LIMITS,
  emptyEducation,
  emptyExperience,
  emptyProject,
  type ProfileEducation,
  type ProfileExperience,
  type ProfileProject,
  type StructuredProfileDraft,
} from "@/lib/profiles/structured-profile";

export type ProfileEditorTab =
  | "basic"
  | "experience"
  | "education"
  | "projects"
  | "socials"
  | "integrations";

export const PROFILE_EDITOR_TABS: Array<{
  id: ProfileEditorTab;
  label: string;
}> = [
  { id: "basic", label: "Basic Info" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "projects", label: "Projects" },
  { id: "socials", label: "Socials" },
  { id: "integrations", label: "Integrations" },
];

const defaultInputClasses =
  "mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 disabled:bg-zinc-50 disabled:text-zinc-400";

type StructuredProfileFieldsProps = {
  tab: ProfileEditorTab;
  draft: StructuredProfileDraft;
  onChange: (next: StructuredProfileDraft) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  inputClassName?: string;
  basicSlot?: ReactNode;
  integrationsSlot?: ReactNode;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{message}</p>;
}

function RepeatHeader({
  title,
  onAdd,
  disabled,
  atCap,
}: {
  title: string;
  onAdd: () => void;
  disabled?: boolean;
  atCap: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || atCap}
        className="text-sm font-semibold text-zinc-700 underline underline-offset-2 hover:text-zinc-900 disabled:opacity-40"
      >
        + Add
      </button>
    </div>
  );
}

export default function StructuredProfileFields({
  tab,
  draft,
  onChange,
  errors = {},
  disabled,
  inputClassName = defaultInputClasses,
  basicSlot,
  integrationsSlot,
}: StructuredProfileFieldsProps) {
  const input = inputClassName;

  function patch(partial: Partial<StructuredProfileDraft>) {
    onChange({ ...draft, ...partial });
  }

  function updateExperience(index: number, partial: Partial<ProfileExperience>) {
    patch({
      experiences: draft.experiences.map((row, i) =>
        i === index ? { ...row, ...partial } : row,
      ),
    });
  }

  function updateEducation(index: number, partial: Partial<ProfileEducation>) {
    patch({
      education: draft.education.map((row, i) =>
        i === index ? { ...row, ...partial } : row,
      ),
    });
  }

  function updateProject(index: number, partial: Partial<ProfileProject>) {
    patch({
      projects: draft.projects.map((row, i) =>
        i === index ? { ...row, ...partial } : row,
      ),
    });
  }

  if (tab === "basic") {
    return (
      <div className="space-y-4">
        {basicSlot}
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Role</span>
          <input
            className={input}
            value={draft.roleTitle}
            onChange={(event) => patch({ roleTitle: event.target.value })}
            maxLength={STRUCTURED_PROFILE_LIMITS.roleTitle}
            disabled={disabled}
            placeholder="Fullstack Engineer"
          />
          <FieldError message={errors.roleTitle} />
        </label>
        <DomainPicker
          value={draft.domains}
          onChange={(domains) => patch({ domains })}
          disabled={disabled}
          error={errors.domains}
        />
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">About you</span>
          <textarea
            className={`${input} resize-y`}
            value={draft.aboutText}
            onChange={(event) => patch({ aboutText: event.target.value })}
            maxLength={STRUCTURED_PROFILE_LIMITS.aboutText}
            rows={5}
            disabled={disabled}
            placeholder="A short professional summary — what you do and what you want next."
          />
          <p className="mt-1 text-right text-xs text-zinc-400">
            {draft.aboutText.length}/{STRUCTURED_PROFILE_LIMITS.aboutText}
          </p>
          <FieldError message={errors.aboutText} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">
            Video resume link{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </span>
          <input
            className={input}
            value={draft.videoUrl}
            onChange={(event) => patch({ videoUrl: event.target.value })}
            maxLength={STRUCTURED_PROFILE_LIMITS.videoUrl}
            disabled={disabled}
            placeholder="YouTube, Loom, or Drive link"
          />
          <FieldError message={errors.videoUrl} />
        </label>
      </div>
    );
  }

  if (tab === "experience") {
    return (
      <div className="space-y-4">
        <RepeatHeader
          title="Work experience"
          disabled={disabled}
          atCap={draft.experiences.length >= STRUCTURED_PROFILE_LIMITS.listMax}
          onAdd={() =>
            patch({ experiences: [...draft.experiences, emptyExperience()] })
          }
        />
        <FieldError message={errors.experiences} />
        {draft.experiences.map((row, index) => (
          <fieldset
            key={`exp-${index}`}
            className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4"
          >
            <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Role {index + 1}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Title</span>
                <input
                  className={input}
                  value={row.title}
                  onChange={(event) =>
                    updateExperience(index, { title: event.target.value })
                  }
                  disabled={disabled}
                  placeholder="Product Engineer"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Company</span>
                <input
                  className={input}
                  value={row.company}
                  onChange={(event) =>
                    updateExperience(index, { company: event.target.value })
                  }
                  disabled={disabled}
                  placeholder="Acme"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Start</span>
                <input
                  className={input}
                  value={row.startDate}
                  onChange={(event) =>
                    updateExperience(index, { startDate: event.target.value })
                  }
                  disabled={disabled}
                  placeholder="Aug 2024"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">End</span>
                <input
                  className={input}
                  value={row.endDate}
                  onChange={(event) =>
                    updateExperience(index, { endDate: event.target.value })
                  }
                  disabled={disabled || row.isCurrent}
                  placeholder="Present"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={row.isCurrent}
                onChange={(event) =>
                  updateExperience(index, {
                    isCurrent: event.target.checked,
                    endDate: event.target.checked ? "" : row.endDate,
                  })
                }
                disabled={disabled}
                className="h-4 w-4 rounded border-zinc-300"
              />
              I currently work here
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Location</span>
              <input
                className={input}
                value={row.location}
                onChange={(event) =>
                  updateExperience(index, { location: event.target.value })
                }
                disabled={disabled}
                placeholder="Bengaluru / Remote"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Summary</span>
              <textarea
                className={`${input} resize-y`}
                rows={3}
                value={row.summary}
                onChange={(event) =>
                  updateExperience(index, { summary: event.target.value })
                }
                disabled={disabled}
                placeholder="What you owned and shipped."
              />
            </label>
            <FieldError message={errors[`experiences.${index}`]} />
            {draft.experiences.length > 1 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  patch({
                    experiences: draft.experiences.filter((_, i) => i !== index),
                  })
                }
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            ) : null}
          </fieldset>
        ))}
      </div>
    );
  }

  if (tab === "education") {
    return (
      <div className="space-y-4">
        <RepeatHeader
          title="Education"
          disabled={disabled}
          atCap={draft.education.length >= STRUCTURED_PROFILE_LIMITS.listMax}
          onAdd={() =>
            patch({ education: [...draft.education, emptyEducation()] })
          }
        />
        <FieldError message={errors.education} />
        {draft.education.map((row, index) => (
          <fieldset
            key={`edu-${index}`}
            className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4"
          >
            <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              School {index + 1}
            </legend>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">School</span>
              <input
                className={input}
                value={row.school}
                onChange={(event) =>
                  updateEducation(index, { school: event.target.value })
                }
                disabled={disabled}
                placeholder="IIT Madras"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Degree</span>
                <input
                  className={input}
                  value={row.degree}
                  onChange={(event) =>
                    updateEducation(index, { degree: event.target.value })
                  }
                  disabled={disabled}
                  placeholder="B.Tech"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Field</span>
                <input
                  className={input}
                  value={row.field}
                  onChange={(event) =>
                    updateEducation(index, { field: event.target.value })
                  }
                  disabled={disabled}
                  placeholder="Computer Science"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Start</span>
                <input
                  className={input}
                  value={row.startDate}
                  onChange={(event) =>
                    updateEducation(index, { startDate: event.target.value })
                  }
                  disabled={disabled}
                  placeholder="2018"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">End</span>
                <input
                  className={input}
                  value={row.endDate}
                  onChange={(event) =>
                    updateEducation(index, { endDate: event.target.value })
                  }
                  disabled={disabled}
                  placeholder="2022"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Notes</span>
              <textarea
                className={`${input} resize-y`}
                rows={2}
                value={row.summary}
                onChange={(event) =>
                  updateEducation(index, { summary: event.target.value })
                }
                disabled={disabled}
              />
            </label>
            <FieldError message={errors[`education.${index}`]} />
            {draft.education.length > 1 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  patch({
                    education: draft.education.filter((_, i) => i !== index),
                  })
                }
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            ) : null}
          </fieldset>
        ))}
      </div>
    );
  }

  if (tab === "projects") {
    return (
      <div className="space-y-4">
        <RepeatHeader
          title="Projects"
          disabled={disabled}
          atCap={draft.projects.length >= STRUCTURED_PROFILE_LIMITS.listMax}
          onAdd={() => patch({ projects: [...draft.projects, emptyProject()] })}
        />
        <FieldError message={errors.projects} />
        {draft.projects.map((row, index) => (
          <fieldset
            key={`proj-${index}`}
            className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4"
          >
            <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Project {index + 1}
            </legend>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Name</span>
              <input
                className={input}
                value={row.name}
                onChange={(event) =>
                  updateProject(index, { name: event.target.value })
                }
                disabled={disabled}
                placeholder="Open-source hiring OS"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">URL</span>
              <input
                className={input}
                value={row.url}
                onChange={(event) =>
                  updateProject(index, { url: event.target.value })
                }
                disabled={disabled}
                placeholder="https://"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">
                Technologies
              </span>
              <input
                className={input}
                value={row.technologies}
                onChange={(event) =>
                  updateProject(index, { technologies: event.target.value })
                }
                disabled={disabled}
                placeholder="TypeScript, Postgres"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Summary</span>
              <textarea
                className={`${input} resize-y`}
                rows={3}
                value={row.summary}
                onChange={(event) =>
                  updateProject(index, { summary: event.target.value })
                }
                disabled={disabled}
              />
            </label>
            <FieldError message={errors[`projects.${index}`]} />
            {draft.projects.length > 1 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  patch({
                    projects: draft.projects.filter((_, i) => i !== index),
                  })
                }
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            ) : null}
          </fieldset>
        ))}
      </div>
    );
  }

  if (tab === "socials") {
    return (
      <SocialsEditor
        draft={draft}
        onChange={onChange}
        errors={errors}
        disabled={disabled}
        inputClassName={input}
      />
    );
  }

  return (
    <IntegrationsEditor
      draft={draft}
      onChange={onChange}
      disabled={disabled}
      inputClassName={input}
      extraSlot={integrationsSlot}
    />
  );
}
