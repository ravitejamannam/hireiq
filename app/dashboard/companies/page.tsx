"use client";

import { useState } from "react";

import type { Company } from "@/types/company";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CompanyCard from "@/components/companies/CompanyCard";
import AddCompanyButton from "@/components/companies/AddCompanyButton";
import CompanyModal from "@/components/companies/CompanyModal";
import EmptyCompanies from "@/components/companies/EmptyCompanies";
import { companies as initialCompanies } from "@/data/companies";

export default function CompaniesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [companies, setCompanies] = useState(initialCompanies);
  const [search, setSearch] = useState("");
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  function handleCreateCompany(company: Omit<Company, "id" | "openRoles">) {
    setCompanies((previousCompanies) => [
      ...previousCompanies,

      {
        id: previousCompanies.length + 1,

        ...company,

        openRoles: 0,
      },
    ]);

    setIsModalOpen(false);
  }

  function handleDeleteCompany(id: number) {
    setCompanies((previousCompanies) =>
      previousCompanies.filter((company) => company.id !== id),
    );
  }

  function handleEditCompany(id: number) {
    const company = companies.find((company) => company.id === id);

    if (!company) return;

    setEditingCompany(company);

    setIsModalOpen(true);
  }

  const filteredCompanies = companies.filter((company) =>
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
        onCreate={handleCreateCompany}
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
