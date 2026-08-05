"use client";

import { useState } from "react";

type CandidateFormData = {
  name: string;
  role: string;
  experience: string;
  status: string;
};

type CandidateFormProps = {
  onCreate: (candidate: CandidateFormData) => void;
  onCancel: () => void;
};
export default function CandidateForm({
  onCreate,
  onCancel,
}: CandidateFormProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [experience, setExperience] = useState("");
  const [status, setStatus] = useState("");

  const [nameError, setNameError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [experienceError, setExperienceError] = useState("");
  const [statusError, setStatusError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let valid = true;

    setNameError("");
    setRoleError("");
    setExperienceError("");
    setStatusError("");

    if (!name.trim()) {
      setNameError("Candidate name is required.");
      valid = false;
    }

    if (!role.trim()) {
      setRoleError("Role is required.");
      valid = false;
    }

    if (!experience.trim()) {
      setExperienceError("Experience is required.");
      valid = false;
    }

    if (!status.trim()) {
      setStatusError("Status is required.");
      valid = false;
    }

    if (!valid) return;

    onCreate({
      name: name.trim(),
      role: role.trim(),
      experience: experience.trim(),
      status: status.trim(),
    });

    setName("");
    setRole("");
    setExperience("");
    setStatus("");

    setNameError("");
    setRoleError("");
    setExperienceError("");
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
          type="text"
          placeholder="4 Years"
          value={experience}
          onChange={(event) => setExperience(event.target.value)}
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
        {experienceError && (
          <p className="mt-2 text-sm text-red-600">{experienceError}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-black">Status</label>

        <input
          type="text"
          placeholder="Interview"
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
            placeholder:text-zinc-400
            outline-none
            transition
            focus:border-black
          "
        />
        {statusError && (
          <p className="mt-2 text-sm text-red-600">{statusError}</p>
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
