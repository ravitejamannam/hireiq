"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClientCompany } from "@/app/actions/organization-actions";
import AuthButton from "@/components/auth/AuthButton";
import AuthInput from "@/components/auth/AuthInput";

export default function CreateCompanyForm() {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [employees, setEmployees] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsLoading(true);

    try {
      await createClientCompany({
        name,
        industry,
        employees: Number(employees),
      });
      router.push("/post-auth");
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to create your company.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <AuthInput
        label="Company name"
        placeholder="Acme Inc."
        value={name}
        onChange={setName}
      />
      <AuthInput
        label="Industry"
        placeholder="Software"
        value={industry}
        onChange={setIndustry}
      />
      <AuthInput
        label="Employees"
        type="number"
        placeholder="50"
        value={employees}
        onChange={setEmployees}
      />

      {formError ? (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      ) : null}

      <AuthButton
        label="Create company"
        type="submit"
        isLoading={isLoading}
        loadingLabel="Creating..."
      />
    </form>
  );
}
