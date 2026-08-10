"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { getJobs } from "@/lib/repositories/job-repository";
import type { Company } from "@/types/company";
import type { JobFormData } from "@/components/jobs/JobForm";
import { createJob, deleteJob, updateJob } from "@/app/actions/job-actions";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import JobCard from "@/components/jobs/JobCard";
import JobModal from "@/components/jobs/JobModal";

type Job = Awaited<ReturnType<typeof getJobs>>[number];

type JobsClientProps = {
  initialJobs: Job[];
  companies: Company[];
};

export default function JobsClient({
  initialJobs,
  companies,
}: JobsClientProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  async function handleSaveJob(job: JobFormData) {
    if (editingJob) {
      await updateJob(editingJob.id, job.title, job.status, job.companyId);
    } else {
      await createJob(job.title, job.status, job.companyId);
    }

    setEditingJob(null);
    setIsModalOpen(false);

    router.refresh();
  }

  function handleEditJob(id: number) {
    const job = initialJobs.find((job) => job.id === id);

    if (!job) return;

    setEditingJob(job);
    setIsModalOpen(true);
  }

  async function handleDeleteJob(id: number) {
    await deleteJob(id);

    router.refresh();
  }

  const filteredJobs = initialJobs.filter((job) =>
    job.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Jobs</h1>

          <p className="mt-2 text-zinc-600">
            Manage open roles across your companies.
          </p>
        </div>

        <div className="mt-8">
          <input
            type="text"
            placeholder="Search jobs..."
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
          + Add Job
        </button>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="mt-10">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
            <div className="text-5xl">📋</div>

            <h2 className="mt-6 text-2xl font-bold text-black">
              No jobs found
            </h2>

            <p className="mt-3 text-center text-zinc-600">
              Try a different search or create a new job.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              id={job.id}
              title={job.title}
              company={job.company.name}
              status={job.status}
              onEdit={handleEditJob}
              onDelete={handleDeleteJob}
            />
          ))}
        </div>
      )}

      <JobModal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingJob(null);
          setIsModalOpen(false);
        }}
        onCreate={handleSaveJob}
        companies={companies}
        initialValues={
          editingJob
            ? {
                title: editingJob.title,
                status: editingJob.status,
                companyId: editingJob.companyId,
              }
            : undefined
        }
      />
    </DashboardLayout>
  );
}
