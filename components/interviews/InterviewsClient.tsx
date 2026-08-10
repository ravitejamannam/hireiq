"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { getApplications } from "@/lib/repositories/application-repository";
import type { getInterviews } from "@/lib/repositories/interview-repository";
import type { InterviewFormData } from "@/components/interviews/InterviewForm";
import {
  createInterview,
  deleteInterview,
  updateInterview,
} from "@/app/actions/interview-actions";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import InterviewCard from "@/components/interviews/InterviewCard";
import InterviewModal from "@/components/interviews/InterviewModal";

type Interview = Awaited<ReturnType<typeof getInterviews>>[number];
type Application = Awaited<ReturnType<typeof getApplications>>[number];

type InterviewsClientProps = {
  initialInterviews: Interview[];
  applications: Application[];
};

export default function InterviewsClient({
  initialInterviews,
  applications,
}: InterviewsClientProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingInterview, setEditingInterview] = useState<Interview | null>(
    null,
  );

  async function handleSaveInterview(interview: InterviewFormData) {
    if (editingInterview) {
      await updateInterview(
        editingInterview.id,
        interview.applicationId,
        interview.type,
        interview.interviewAt,
        interview.result,
      );
    } else {
      await createInterview(
        interview.applicationId,
        interview.type,
        interview.interviewAt,
        interview.result,
      );
    }

    setEditingInterview(null);
    setIsModalOpen(false);

    router.refresh();
  }

  function handleEditInterview(id: number) {
    const interview = initialInterviews.find((interview) => interview.id === id);

    if (!interview) return;

    setEditingInterview(interview);
    setIsModalOpen(true);
  }

  async function handleDeleteInterview(id: number) {
    await deleteInterview(id);

    router.refresh();
  }

  const filteredInterviews = initialInterviews.filter((interview) => {
    const query = search.toLowerCase();

    return (
      interview.application.candidate.name.toLowerCase().includes(query) ||
      interview.application.job.title.toLowerCase().includes(query) ||
      interview.application.job.company.name.toLowerCase().includes(query)
    );
  });

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Interviews</h1>

          <p className="mt-2 text-zinc-600">
            Manage interviews across candidate applications.
          </p>
        </div>

        <div className="mt-8">
          <input
            type="text"
            placeholder="Search interviews..."
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
          + Add Interview
        </button>
      </div>

      {filteredInterviews.length === 0 ? (
        <div className="mt-10">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
            <div className="text-5xl">📅</div>

            <h2 className="mt-6 text-2xl font-bold text-black">
              No interviews found
            </h2>

            <p className="mt-3 text-center text-zinc-600">
              Try a different search or create a new interview.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredInterviews.map((interview) => (
            <InterviewCard
              key={interview.id}
              id={interview.id}
              candidateName={interview.application.candidate.name}
              jobTitle={interview.application.job.title}
              companyName={interview.application.job.company.name}
              type={interview.type}
              interviewAt={interview.interviewAt}
              result={interview.result}
              onEdit={handleEditInterview}
              onDelete={handleDeleteInterview}
            />
          ))}
        </div>
      )}

      <InterviewModal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingInterview(null);
          setIsModalOpen(false);
        }}
        onCreate={handleSaveInterview}
        applications={applications}
        initialValues={
          editingInterview
            ? {
                applicationId: editingInterview.applicationId,
                type: editingInterview.type,
                interviewAt: editingInterview.interviewAt,
                result: editingInterview.result,
              }
            : undefined
        }
      />
    </DashboardLayout>
  );
}
