"use client";

import { useState } from "react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CandidateCard from "@/components/candidates/CandidateCard";
import AddCandidateButton from "@/components/candidates/AddCandidateButton";
import CandidateModal from "@/components/candidates/CandidateModal";
import { candidates as initialCandidates } from "@/data/candidates";
import EmptyCandidates from "@/components/candidates/EmptyCandidates";

export default function CandidatesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [search, setSearch] = useState("");

  function handleCreateCandidate(candidate: {
    name: string;
    role: string;
    experience: string;
    status: string;
  }) {
    setCandidates((previousCandidates) => [
      ...previousCandidates,
      {
        id: previousCandidates.length + 1,
        ...candidate,
      },
    ]);

    setIsModalOpen(false);
  }

  function handleDeleteCandidate(id: number) {
    setCandidates((previousCandidates) =>
      previousCandidates.filter((candidate) => candidate.id !== id),
    );
  }

  const filteredCandidates = candidates.filter((candidate) =>
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
              experience={candidate.experience}
              status={candidate.status}
              onDelete={handleDeleteCandidate}
            />
          ))}
        </div>
      )}

      <CandidateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateCandidate}
      />
    </DashboardLayout>
  );
}
