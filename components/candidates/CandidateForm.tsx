"use client";

import { useState } from "react";
import type { CandidateStatus } from "@prisma/client";
import type { Company } from "@/types/company";

type CandidateFormData = {
  name: string;
  role: string;
  experienceYears: number;
  status: CandidateStatus;
  companyId: number;
};

type CandidateFormProps = {
  onCreate: (candidate: CandidateFormData) => void;
  onCancel: () => void;
  companies: Company[];
  initialValues?: CandidateFormData;
};
export default function CandidateForm({
  onCreate,
  onCancel,
  companies,
  initialValues,
}: CandidateFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [role, setRole] = useState( initialValues?.role ?? "");
  const [experienceYears, setExperienceYears] = useState( initialValues?.experienceYears.toString() ?? "");
  const [status, setStatus] = useState( initialValues?.status ?? "");
  const [companyId, setCompanyId] = useState( initialValues?.companyId.toString() ?? "");

  const [nameError, setNameError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [experienceYearsError, setExperienceYearsError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [companyIdError, setCompanyIdError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setNameError("");
    setRoleError("");
    setExperienceYearsError("");
    setStatusError("");

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
    }

    if (!status.trim()) {
      setStatusError("Status is required.");
      valid = false;
    }

    if (!companyId.trim()) {
      setCompanyIdError("Company is required.");
      valid = false;
    }

    if (!valid) return;

    onCreate({
      name: name.trim(),
      role: role.trim(),
      experienceYears: Number(experienceYears),
      status: status as CandidateStatus,
      companyId: Number(companyId),
    });

    setName("");
    setRole("");
    setExperienceYears("");
    setStatus("");

    setNameError("");
    setRoleError("");
    setExperienceYearsError("");
    setStatusError("");
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium text-black">
          Candidate Name
        </label>

        <input
          type="text"
          placeholder="Reddy"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            placeholder:text-zinc-400
            outline-none
            transition
            focus:border-black
          "
        />
        {nameError && <p className="mt-2 text-sm text-red-600">{nameError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">Role</label>

        <input
          type="text"
          placeholder="Frontend Engineer"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            placeholder:text-zinc-400
            outline-none
            transition
            focus:border-black
          "
        />
        {roleError && <p className="mt-2 text-sm text-red-600">{roleError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">
          Experience
        </label>

        <input
          type="number"
          placeholder="4"
          value={experienceYears}
          onChange={(event) => setExperienceYears(event.target.value)}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-4
            py-3
            text-black
            placeholder:text-zinc-400
            outline-none
            transition
            focus:border-black
          "
        />
        {experienceYearsError && (
          <p className="mt-2 text-sm text-red-600">{experienceYearsError}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">Status</label>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="
    mt-2
    w-full
    rounded-lg
    border
    border-zinc-300
    bg-white
    px-4
    py-3
    text-black
    outline-none
    transition
    focus:border-black
  "
        >
          <option value="">Select Status</option>
          <option value="APPLIED">Applied</option>
          <option value="INTERVIEWING">Interviewing</option>
          <option value="OFFER">Offer</option>
          <option value="HIRED">Hired</option>
          <option value="REJECTED">Rejected</option>
        </select>
        {statusError && (
          <p className="mt-2 text-sm text-red-600">{statusError}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">Company</label>

        <select
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          className="
      mt-2
      w-full
      rounded-lg
      border
      border-zinc-300
      bg-white
      px-4
      py-3
      text-black
      outline-none
      transition
      focus:border-black
    "
        >
          <option value="">Select Company</option>

          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>

        {companyIdError && (
          <p className="mt-2 text-sm text-red-600">{companyIdError}</p>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="
            rounded-lg
            border
            border-zinc-300
            bg-white
            px-5
            py-3
            font-medium
            text-black
            transition
            hover:bg-zinc-100
          "
        >
          Cancel
        </button>

        <button
          type="submit"
          className="
            rounded-lg
            bg-black
            px-5
            py-3
            font-medium
            text-white
            transition
            hover:bg-zinc-800
          "
        >
          Create Candidate
        </button>
      </div>
    </form>
  );
}
