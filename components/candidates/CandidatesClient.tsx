"use client";

import { useState } from "react";
import type { CandidateStatus } from "@prisma/client";
import type { Candidate } from "@/types/candidate";
import type { Company } from "@/types/company";
import {
  createCandidate,
  deleteCandidate,
  updateCandidate,
} from "@/app/actions/candidate-actions";
import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CandidateCard from "@/components/candidates/CandidateCard";
import AddCandidateButton from "@/components/candidates/AddCandidateButton";
import CandidateModal from "@/components/candidates/CandidateModal";
import EmptyCandidates from "@/components/candidates/EmptyCandidates";

type CandidatesClientProps = {
  initialCandidates: Candidate[];
  companies: Company[];
};

export default function CandidatesClient({
  initialCandidates,
  companies,
}: CandidatesClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState("");

  const router = useRouter();

  async function handleSaveCandidate(candidate: {
    name: string;
    role: string;
    experienceYears: number;
    status: CandidateStatus;
    companyId: number;
  }) {
    if (editingCandidate) {
      await updateCandidate(
        editingCandidate.id,
        candidate.name,
        candidate.role,
        candidate.experienceYears,
        candidate.status,
      );
    } else {
      await createCandidate(
        candidate.name,
        candidate.role,
        candidate.experienceYears,
        candidate.status,
        candidate.companyId,
      );
    }

    setEditingCandidate(null);
    setIsModalOpen(false);

    router.refresh();
  }

  function handleEditCandidate(id: number) {
  const candidate = initialCandidates.find(
    (candidate) => candidate.id === id,
  );

  if (!candidate) return;

  setEditingCandidate(candidate);
  setIsModalOpen(true);
}
  async function handleDeleteCandidate(id: number) {
    const confirmed = window.confirm(
      "Delete this candidate? This is ordinary deletion, not a GDPR erasure. Candidates with hiring, evidence, identity, or intelligence records cannot be deleted this way. The delete can still be refused after you confirm.",
    );
    if (!confirmed) return;

    setDeleteError("");
    const result = await deleteCandidate(id);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }

    router.refresh();
  }

  const filteredCandidates = initialCandidates.filter((candidate) =>
    candidate.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Candidates</h1>

          <p className="mt-2 text-zinc-600">
            Manage all candidates using HireIQ.
          </p>
        </div>

        <div className="mt-8">
          <input
            type="text"
            placeholder="Search candidates..."
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

        <AddCandidateButton onClick={() => setIsModalOpen(true)} />
      </div>

      {deleteError ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {deleteError}
        </p>
      ) : null}

      {filteredCandidates.length === 0 ? (
        <div className="mt-10">
          <EmptyCandidates />
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredCandidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              id={candidate.id}
              name={candidate.name}
              role={candidate.role}
              experience={candidate.experienceYears.toString()}
              status={candidate.status}
              onEdit={handleEditCandidate}
              onDelete={handleDeleteCandidate}
            />
          ))}
        </div>
      )}

      <CandidateModal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingCandidate(null);
          setIsModalOpen(false);
        }}
        onCreate={handleSaveCandidate}
        companies={companies}
        initialValues={
          editingCandidate
            ? {
                name: editingCandidate.name,
                role: editingCandidate.role,
                experienceYears: editingCandidate.experienceYears,
                status: editingCandidate.status,
                companyId: editingCandidate.companyId,
              }
            : undefined
        }
      />
    </DashboardLayout>
  );
}
