"use client";

import { useState } from "react";

import type { Company } from "@/types/company";
import { createCompany, deleteCompany, updateCompany } from "@/app/actions/company-actions";

import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CompanyCard from "@/components/companies/CompanyCard";
import AddCompanyButton from "@/components/companies/AddCompanyButton";
import CompanyModal from "@/components/companies/CompanyModal";
import EmptyCompanies from "@/components/companies/EmptyCompanies";

type CompaniesClientProps = {
  initialCompanies: Company[];
};

export default function CompaniesClient({
  initialCompanies,
}: CompaniesClientProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  async function handleSaveCompany(
    company: Omit<Company, "id" | "openRoles">,
  ) {
    if (editingCompany){
      await updateCompany(
        editingCompany.id,
        company.name,
        company.industry,
        company.employees,
      );
     } else {
      await createCompany(
        company.name,
        company.industry,
        company.employees,
      );

      
    }

    setEditingCompany(null);

    setIsModalOpen(false);

    router.refresh();
  }

  async function handleDeleteCompany(id: number) {
    await deleteCompany(id);

  router.refresh();
  }

  function handleEditCompany(id: number) {
    const company = initialCompanies.find((company) => company.id === id);

    if (!company) return;

    setEditingCompany(company);

    setIsModalOpen(true);
  }

  const filteredCompanies = initialCompanies.filter((company) =>
    company.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Companies</h1>

          <p className="mt-2 text-zinc-600">
            Manage all companies using HireIQ.
          </p>
        </div>

        <AddCompanyButton onClick={() => setIsModalOpen(true)} />

        <div className="mt-8">
          <input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="
      w-full
      rounded-xl
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
        </div>
      </div>

      {filteredCompanies.length === 0 ? (
        <div className="mt-10">
          <EmptyCompanies />
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredCompanies.map((company) => (
            <CompanyCard
              key={company.id}
              id={company.id}
              name={company.name}
              industry={company.industry}
              employees={company.employees}
              openRoles={company.openRoles}
              onDelete={handleDeleteCompany}
              onEdit={handleEditCompany}
            />
          ))}
        </div>
      )}

      <CompanyModal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingCompany(null);
          setIsModalOpen(false);
        }}
        onCreate={handleSaveCompany}
        initialValues={
          editingCompany
            ? {
                name: editingCompany.name,
                industry: editingCompany.industry,
                employees: editingCompany.employees,
              }
            : undefined
        }
      />
    </DashboardLayout>
  );
}
