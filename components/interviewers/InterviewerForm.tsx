"use client";

import { useState } from "react";
import type {
  InterviewerAvailability,
  InterviewerCategory,
} from "@prisma/client";

const categoryOptions = [
  { value: "ENGINEERING", label: "Engineering" },
  { value: "DATA_SCIENCE", label: "Data Science" },
  { value: "PRODUCT", label: "Product" },
  { value: "DESIGN", label: "Design" },
] as const satisfies ReadonlyArray<{
  value: InterviewerCategory;
  label: string;
}>;

const availabilityOptions = [
  { value: "AVAILABLE", label: "Available" },
  { value: "NOT_AVAILABLE", label: "Not Available" },
] as const satisfies ReadonlyArray<{
  value: InterviewerAvailability;
  label: string;
}>;

export type InterviewerFormData = {
  name: string;
  category: InterviewerCategory;
  availability: InterviewerAvailability;
};

type InterviewerFormProps = {
  initialValues?: InterviewerFormData;
  errorMessage?: string;
  isSaving?: boolean;
  onCancel: () => void;
  onSave: (interviewer: InterviewerFormData) => void;
};

export default function InterviewerForm({
  initialValues,
  errorMessage,
  isSaving = false,
  onCancel,
  onSave,
}: InterviewerFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [category, setCategory] = useState<InterviewerCategory | "">(
    initialValues?.category ?? "",
  );
  const [availability, setAvailability] = useState<
    InterviewerAvailability | ""
  >(initialValues?.availability ?? "");

  const [nameError, setNameError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;
    setNameError("");
    setCategoryError("");
    setAvailabilityError("");

    if (!name.trim()) {
      setNameError("Interviewer name is required.");
      valid = false;
    }

    if (!category) {
      setCategoryError("Category is required.");
      valid = false;
    }

    if (!availability) {
      setAvailabilityError("Availability is required.");
      valid = false;
    }

    if (!valid || !category || !availability) return;

    onSave({
      name: name.trim(),
      category,
      availability,
    });
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="interviewer-name" className="block text-sm font-medium text-black">
          Interviewer Name
        </label>
        <input
          id="interviewer-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Rajiv Kumar"
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black placeholder:text-zinc-400 outline-none transition focus:border-black"
        />
        {nameError && <p className="mt-2 text-sm text-red-600">{nameError}</p>}
      </div>

      <div>
        <label htmlFor="interviewer-category" className="block text-sm font-medium text-black">
          Specialty / Category
        </label>
        <select
          id="interviewer-category"
          value={category}
          onChange={(event) => setCategory(event.target.value as InterviewerCategory | "")}
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
        >
          <option value="">Select Category</option>
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {categoryError && <p className="mt-2 text-sm text-red-600">{categoryError}</p>}
      </div>

      <div>
        <label htmlFor="interviewer-availability" className="block text-sm font-medium text-black">
          Availability
        </label>
        <select
          id="interviewer-availability"
          value={availability}
          onChange={(event) => setAvailability(event.target.value as InterviewerAvailability | "")}
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
        >
          <option value="">Select Availability</option>
          {availabilityOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {availabilityError && <p className="mt-2 text-sm text-red-600">{availabilityError}</p>}
      </div>

      <div className="flex justify-end gap-3 border-t border-zinc-200 pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 bg-white px-5 py-3 font-medium text-black transition hover:bg-zinc-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-black px-5 py-3 font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isSaving ? "Saving..." : initialValues ? "Save Interviewer" : "Create Interviewer"}
        </button>
      </div>
    </form>
  );
}
