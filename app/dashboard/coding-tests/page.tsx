"use client";

import { useState } from "react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CodingTestCard from "@/components/coding-tests/CodingTestCard";
import AddCodingTestButton from "@/components/coding-tests/AddCodingTestButton";
import CodingTestModal from "@/components/coding-tests/CodingTestModal";
import EmptyCodingTests from "@/components/coding-tests/EmptyCodingTests";
import { codingTests } from "@/data/coding-tests";

export default function CodingTestsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [search, setSearch] = useState("");

  const filteredCodingTests = codingTests.filter((test) =>
    test.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-black">Coding Tests</h1>

        <p className="mt-2 text-zinc-600">
          Manage coding assessments for candidates.
        </p>
      </div>

      <div className="mt-8">
        <input
          placeholder="Search coding tests..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-black"
        />
      </div>

      <AddCodingTestButton onClick={() => setIsModalOpen(true)} />

      {filteredCodingTests.length === 0 ? (
        <div className="mt-10">
          <EmptyCodingTests />
        </div>
      ) : (

      <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredCodingTests.map((test) => (
          <CodingTestCard
            key={test.id}
            title={test.title}
            candidate={test.candidate}
            company={test.company}
            difficulty={test.difficulty}
            status={test.status}
          />
        ))}
      </div>
      )}

      <CodingTestModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </DashboardLayout>
  );
}
