"use client";

import { useState } from "react";
import type { JobStatus } from "@prisma/client";
import type { Company } from "@/types/company";

export type JobFormData = {
  title: string;
  status: JobStatus;
  companyId: number;
};

type JobFormProps = {
  onCreate: (job: JobFormData) => void;
  onCancel: () => void;
  companies: Company[];
  initialValues?: JobFormData;
};

export default function JobForm({
  onCreate,
  onCancel,
  companies,
  initialValues,
}: JobFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [status, setStatus] = useState(initialValues?.status ?? "");
  const [companyId, setCompanyId] = useState(
    initialValues?.companyId.toString() ?? "",
  );

  const [titleError, setTitleError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [companyIdError, setCompanyIdError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setTitleError("");
    setStatusError("");
    setCompanyIdError("");

    if (!title.trim()) {
      setTitleError("Job title is required.");
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
      title: title.trim(),
      status: status as JobStatus,
      companyId: Number(companyId),
    });
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium text-black">
          Job Title
        </label>

        <input
          type="text"
          placeholder="Senior Backend Engineer"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
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

        {titleError && (
          <p className="mt-2 text-sm text-red-600">{titleError}</p>
        )}
      </div>

      <div>
        <label htmlFor="job-status" className="block text-sm font-medium text-black">Status</label>

        <select
          id="job-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as JobStatus)}
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
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="FILLED">Filled</option>
        </select>

        {statusError && (
          <p className="mt-2 text-sm text-red-600">{statusError}</p>
        )}
      </div>

      <div>
        <label htmlFor="job-company" className="block text-sm font-medium text-black">Company</label>

        <select
          id="job-company"
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
          {initialValues ? "Save Changes" : "Create Job"}
        </button>
      </div>
    </form>
  );
}
