"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClientRequirementDraft } from "@/app/actions/organization-actions";

export default function CreateFirstRoleForm() {
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsLoading(true);

    try {
      const job = await createClientRequirementDraft(title);
      router.push(`/client/requirements/${job.id}`);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to create this role.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-black">
        Role title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Senior Backend Engineer"
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-black outline-none transition focus:border-black"
        />
      </label>
      {formError ? (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isLoading}
        className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {isLoading ? "Creating..." : "Create your first role"}
      </button>
    </form>
  );
}
