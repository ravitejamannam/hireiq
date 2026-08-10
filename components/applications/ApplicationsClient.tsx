"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { getApplications } from "@/lib/repositories/application-repository";
import type { getCandidates } from "@/lib/repositories/candidate-repository";
import type { getJobs } from "@/lib/repositories/job-repository";
import type { ApplicationFormData } from "@/components/applications/ApplicationForm";
import {
  createApplication,
  deleteApplication,
  updateApplication,
} from "@/app/actions/application-actions";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ApplicationCard from "@/components/applications/ApplicationCard";
import ApplicationModal from "@/components/applications/ApplicationModal";

type Application = Awaited<ReturnType<typeof getApplications>>[number];
type Candidate = Awaited<ReturnType<typeof getCandidates>>[number];
type Job = Awaited<ReturnType<typeof getJobs>>[number];

type ApplicationsClientProps = {
  initialApplications: Application[];
  candidates: Candidate[];
  jobs: Job[];
};

export default function ApplicationsClient({
  initialApplications,
  candidates,
  jobs,
}: ApplicationsClientProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingApplication, setEditingApplication] =
    useState<Application | null>(null);

  async function handleSaveApplication(application: ApplicationFormData) {
    if (editingApplication) {
      await updateApplication(
        editingApplication.id,
        application.candidateId,
        application.jobId,
        application.status,
      );
    } else {
      await createApplication(
        application.candidateId,
        application.jobId,
        application.status,
      );
    }

    setEditingApplication(null);
    setIsModalOpen(false);

    router.refresh();
  }

  function handleEditApplication(id: number) {
    const application = initialApplications.find(
      (application) => application.id === id,
    );

    if (!application) return;

    setEditingApplication(application);
    setIsModalOpen(true);
  }

  async function handleDeleteApplication(id: number) {
    await deleteApplication(id);

    router.refresh();
  }

  const filteredApplications = initialApplications.filter((application) => {
    const query = search.toLowerCase();

    return (
      application.candidate.name.toLowerCase().includes(query) ||
      application.job.title.toLowerCase().includes(query) ||
      application.job.company.name.toLowerCase().includes(query)
    );
  });

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Applications</h1>

          <p className="mt-2 text-zinc-600">
            Manage candidate pipelines for open roles.
          </p>
        </div>

        <div className="mt-8">
          <input
            type="text"
            placeholder="Search applications..."
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
          + Add Application
        </button>
      </div>

      {filteredApplications.length === 0 ? (
        <div className="mt-10">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
            <div className="text-5xl">🗂️</div>

            <h2 className="mt-6 text-2xl font-bold text-black">
              No applications found
            </h2>

            <p className="mt-3 text-center text-zinc-600">
              Try a different search or create a new application.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredApplications.map((application) => (
            <ApplicationCard
              key={application.id}
              id={application.id}
              candidateName={application.candidate.name}
              jobTitle={application.job.title}
              companyName={application.job.company.name}
              status={application.status}
              onEdit={handleEditApplication}
              onDelete={handleDeleteApplication}
            />
          ))}
        </div>
      )}

      <ApplicationModal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingApplication(null);
          setIsModalOpen(false);
        }}
        onCreate={handleSaveApplication}
        candidates={candidates}
        jobs={jobs}
        initialValues={
          editingApplication
            ? {
                candidateId: editingApplication.candidateId,
                jobId: editingApplication.jobId,
                status: editingApplication.status,
              }
            : undefined
        }
      />
    </DashboardLayout>
  );
}
