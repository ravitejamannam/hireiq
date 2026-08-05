"use client";

import { useState } from "react";

type CompanyFormData = {
  name: string;
  industry: string;
  employees: number;
};

type CompanyFormProps = {
  onCreate: (company: CompanyFormData) => void;
  onCancel: () => void;
  initialValues?: CompanyFormData;
};

export default function CompanyForm({ onCreate, onCancel, initialValues }: CompanyFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
const [industry, setIndustry] = useState(initialValues?.industry ?? "");
const [employees, setEmployees] = useState(
  initialValues?.employees.toString() ?? ""
);

  const [nameError, setNameError] = useState("");
  const [industryError, setIndustryError] = useState("");
  const [employeesError, setEmployeesError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setNameError("");
    setIndustryError("");
    setEmployeesError("");

    if (!name.trim()) {
      setNameError("Company name is required.");
      valid = false;
    }

    if (!industry.trim()) {
      setIndustryError("Industry is required.");
      valid = false;
    }

    if (!employees.trim()) {
      setEmployeesError("Employees is required.");
      valid = false;
    }

    if (!valid) return;

    onCreate({
      name: name.trim(),
      industry: industry.trim(),
      employees: Number(employees),
    });
    setName("");
    setIndustry("");
    setEmployees("");

    setNameError("");
    setIndustryError("");
    setEmployeesError("");
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium text-black">
          Company Name
        </label>

        <input
          type="text"
          placeholder="Acme Inc."
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
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
        <label className="block text-sm font-medium text-black">Industry</label>

        <input
          type="text"
          placeholder="Technology"
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            px-4
            py-3
            text-black
            placeholder:text-zinc-400
            outline-none
            transition
            focus:border-black
          "
        />
        {industryError && (
          <p className="mt-2 text-sm text-red-600">{industryError}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">
          Employees
        </label>

        <input
          type="number"
          placeholder="125"
          value={employees}
          onChange={(event) => setEmployees(event.target.value)}
          className="
            mt-2
            w-full
            rounded-lg
            border
            border-zinc-300
            px-4
            py-3
            text-black
            placeholder:text-zinc-400
            outline-none
            transition
            focus:border-black
          "
        />
        {employeesError && (
          <p className="mt-2 text-sm text-red-600">{employeesError}</p>
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
            px-5
            py-3
            font-medium
            text-black
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
            hover:bg-zinc-800
          "
        >
          Create Company
        </button>
      </div>
    </form>
  );
}
