"use client";

import { useState } from "react";
import { SourcingDatabaseSource } from "@prisma/client";

import { APPLICATION_SOURCE_OPTIONS } from "@/components/applications/ApplicationForm";

export type SourcedProfileFormData = {
  name: string;
  role: string;
  experienceYears: number;
  location: string;
  currentEmployer: string;
  skills: string;
  expectedCTC: string;
  source: SourcingDatabaseSource;
};

type SourcedProfileFormProps = {
  disabled?: boolean;
  isSubmitting?: boolean;
  errorMessage?: string;
  successMessage?: string;
  onSubmit: (data: SourcedProfileFormData) => Promise<void> | void;
};

export default function SourcedProfileForm({
  disabled = false,
  isSubmitting = false,
  errorMessage = "",
  successMessage = "",
  onSubmit,
}: SourcedProfileFormProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [location, setLocation] = useState("");
  const [currentEmployer, setCurrentEmployer] = useState("");
  const [skills, setSkills] = useState("");
  const [expectedCTC, setExpectedCTC] = useState("");
  const [source, setSource] = useState<SourcingDatabaseSource | "">("");

  const [nameError, setNameError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [experienceYearsError, setExperienceYearsError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [currentEmployerError, setCurrentEmployerError] = useState("");
  const [skillsError, setSkillsError] = useState("");
  const [expectedCTCError, setExpectedCTCError] = useState("");
  const [sourceError, setSourceError] = useState("");

  function resetForm() {
    setName("");
    setRole("");
    setExperienceYears("");
    setLocation("");
    setCurrentEmployer("");
    setSkills("");
    setExpectedCTC("");
    setSource("");
    setNameError("");
    setRoleError("");
    setExperienceYearsError("");
    setLocationError("");
    setCurrentEmployerError("");
    setSkillsError("");
    setExpectedCTCError("");
    setSourceError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled || isSubmitting) return;

    let valid = true;

    setNameError("");
    setRoleError("");
    setExperienceYearsError("");
    setLocationError("");
    setCurrentEmployerError("");
    setSkillsError("");
    setExpectedCTCError("");
    setSourceError("");

    if (!name.trim()) {
      setNameError("Candidate name is required.");
      valid = false;
    }

    if (!role.trim()) {
      setRoleError("Role is required.");
      valid = false;
    }

    if (!experienceYears.trim()) {
      setExperienceYearsError("Experience is required.");
      valid = false;
    } else if (
      !Number.isInteger(Number(experienceYears)) ||
      Number(experienceYears) < 0
    ) {
      setExperienceYearsError("Experience years must be a non-negative integer.");
      valid = false;
    }

    if (!location.trim()) {
      setLocationError("Location is required.");
      valid = false;
    }

    if (!currentEmployer.trim()) {
      setCurrentEmployerError("Current employer is required.");
      valid = false;
    }

    if (!skills.trim()) {
      setSkillsError("Skills are required.");
      valid = false;
    }

    if (!expectedCTC.trim()) {
      setExpectedCTCError("Expected CTC is required.");
      valid = false;
    }

    if (!source) {
      setSourceError("Source is required.");
      valid = false;
    }

    if (!valid || !source) return;

    await onSubmit({
      name: name.trim(),
      role: role.trim(),
      experienceYears: Number(experienceYears),
      location: location.trim(),
      currentEmployer: currentEmployer.trim(),
      skills: skills.trim(),
      expectedCTC: expectedCTC.trim(),
      source,
    });

    resetForm();
  }

  const fieldDisabled = disabled || isSubmitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <div>
        <h2 className="text-xl font-bold text-black">Add sourced profile</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Manually add a LinkedIn or Naukri profile to this requirement&apos;s CV
          Pool.
        </p>
      </div>

      {disabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Database access has not been received.
        </p>
      )}

      {errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {successMessage && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="sourced-name" className="block text-sm font-medium text-black">
            Candidate Name
          </label>
          <input
            id="sourced-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={fieldDisabled}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
          />
          {nameError && <p className="mt-2 text-sm text-red-600">{nameError}</p>}
        </div>

        <div>
          <label htmlFor="sourced-role" className="block text-sm font-medium text-black">
            Current Role
          </label>
          <input
            id="sourced-role"
            type="text"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            disabled={fieldDisabled}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
          />
          {roleError && <p className="mt-2 text-sm text-red-600">{roleError}</p>}
        </div>

        <div>
          <label
            htmlFor="sourced-experience"
            className="block text-sm font-medium text-black"
          >
            Experience (years)
          </label>
          <input
            id="sourced-experience"
            type="number"
            min={0}
            step={1}
            value={experienceYears}
            onChange={(event) => setExperienceYears(event.target.value)}
            disabled={fieldDisabled}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
          />
          {experienceYearsError && (
            <p className="mt-2 text-sm text-red-600">{experienceYearsError}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="sourced-location"
            className="block text-sm font-medium text-black"
          >
            Location
          </label>
          <input
            id="sourced-location"
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            disabled={fieldDisabled}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
          />
          {locationError && (
            <p className="mt-2 text-sm text-red-600">{locationError}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="sourced-employer"
            className="block text-sm font-medium text-black"
          >
            Current Employer
          </label>
          <input
            id="sourced-employer"
            type="text"
            value={currentEmployer}
            onChange={(event) => setCurrentEmployer(event.target.value)}
            disabled={fieldDisabled}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
          />
          {currentEmployerError && (
            <p className="mt-2 text-sm text-red-600">{currentEmployerError}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="sourced-expected-ctc"
            className="block text-sm font-medium text-black"
          >
            Expected CTC
          </label>
          <input
            id="sourced-expected-ctc"
            type="text"
            value={expectedCTC}
            onChange={(event) => setExpectedCTC(event.target.value)}
            disabled={fieldDisabled}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
          />
          {expectedCTCError && (
            <p className="mt-2 text-sm text-red-600">{expectedCTCError}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="sourced-skills"
            className="block text-sm font-medium text-black"
          >
            Skills
          </label>
          <textarea
            id="sourced-skills"
            rows={3}
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            disabled={fieldDisabled}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
          />
          {skillsError && (
            <p className="mt-2 text-sm text-red-600">{skillsError}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="sourced-source"
            className="block text-sm font-medium text-black"
          >
            Source
          </label>
          <select
            id="sourced-source"
            value={source}
            onChange={(event) =>
              setSource(event.target.value as SourcingDatabaseSource | "")
            }
            disabled={fieldDisabled}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
          >
            <option value="">Select source</option>
            {APPLICATION_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {sourceError && (
            <p className="mt-2 text-sm text-red-600">{sourceError}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={fieldDisabled}
        className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Adding..." : "Add to CV Pool"}
      </button>
    </form>
  );
}
