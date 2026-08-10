"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { getApplications } from "@/lib/repositories/application-repository";
import type { getCodingTests } from "@/lib/repositories/coding-test-repository";
import type { CodingTestFormData } from "@/components/coding-tests/CodingTestForm";
import {
  createCodingTest,
  deleteCodingTest,
  updateCodingTest,
} from "@/app/actions/coding-test-actions";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CodingTestCard from "@/components/coding-tests/CodingTestCard";
import CodingTestModal from "@/components/coding-tests/CodingTestModal";

type CodingTest = Awaited<ReturnType<typeof getCodingTests>>[number];
type Application = Awaited<ReturnType<typeof getApplications>>[number];

type CodingTestsClientProps = {
  initialCodingTests: CodingTest[];
  applications: Application[];
};

export default function CodingTestsClient({
  initialCodingTests,
  applications,
}: CodingTestsClientProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingCodingTest, setEditingCodingTest] =
    useState<CodingTest | null>(null);

  async function handleSaveCodingTest(codingTest: CodingTestFormData) {
    if (editingCodingTest) {
      await updateCodingTest(
        editingCodingTest.id,
        codingTest.applicationId,
        codingTest.title,
        codingTest.score,
        codingTest.maxScore,
        codingTest.status,
        codingTest.takenAt,
      );
    } else {
      await createCodingTest(
        codingTest.applicationId,
        codingTest.title,
        codingTest.score,
        codingTest.maxScore,
        codingTest.status,
        codingTest.takenAt,
      );
    }

    setEditingCodingTest(null);
    setIsModalOpen(false);

    router.refresh();
  }

  function handleEditCodingTest(id: number) {
    const codingTest = initialCodingTests.find(
      (codingTest) => codingTest.id === id,
    );

    if (!codingTest) return;

    setEditingCodingTest(codingTest);
    setIsModalOpen(true);
  }

  async function handleDeleteCodingTest(id: number) {
    await deleteCodingTest(id);

    router.refresh();
  }

  const filteredCodingTests = initialCodingTests.filter((codingTest) => {
    const query = search.toLowerCase();

    return (
      codingTest.title.toLowerCase().includes(query) ||
      codingTest.application.candidate.name.toLowerCase().includes(query) ||
      codingTest.application.job.title.toLowerCase().includes(query) ||
      codingTest.application.job.company.name.toLowerCase().includes(query)
    );
  });

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Coding Tests</h1>

          <p className="mt-2 text-zinc-600">
            Manage coding assessments across applications.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="
            rounded-lg
            bg-black
            px-5
            py-3
            text-sm
            font-semibold
            text-white
            transition
            hover:bg-zinc-800
          "
        >
          + Add Coding Test
        </button>
      </div>

      <div className="mt-8">
        <input
          type="text"
          placeholder="Search coding tests..."
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

      {filteredCodingTests.length === 0 ? (
        <div className="mt-10">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
            <h2 className="text-2xl font-bold text-black">
              No coding tests found
            </h2>

            <p className="mt-3 text-center text-zinc-600">
              Try a different search or create a new coding test.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredCodingTests.map((codingTest) => (
            <CodingTestCard
              key={codingTest.id}
              id={codingTest.id}
              title={codingTest.title}
              candidateName={codingTest.application.candidate.name}
              jobTitle={codingTest.application.job.title}
              companyName={codingTest.application.job.company.name}
              score={codingTest.score}
              maxScore={codingTest.maxScore}
              status={codingTest.status}
              takenAt={codingTest.takenAt}
              onEdit={handleEditCodingTest}
              onDelete={handleDeleteCodingTest}
            />
          ))}
        </div>
      )}

      <CodingTestModal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingCodingTest(null);
          setIsModalOpen(false);
        }}
        onCreate={handleSaveCodingTest}
        applications={applications}
        initialValues={
          editingCodingTest
            ? {
                applicationId: editingCodingTest.applicationId,
                title: editingCodingTest.title,
                score: editingCodingTest.score,
                maxScore: editingCodingTest.maxScore,
                status: editingCodingTest.status,
                takenAt: editingCodingTest.takenAt,
              }
            : undefined
        }
      />
    </DashboardLayout>
  );
}
