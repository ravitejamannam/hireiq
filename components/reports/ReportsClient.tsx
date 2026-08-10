"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { getApplications } from "@/lib/repositories/application-repository";
import type { getReports } from "@/lib/repositories/report-repository";
import type { ReportFormData } from "@/components/reports/ReportForm";
import {
  createReport,
  deleteReport,
  updateReport,
} from "@/app/actions/report-actions";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ReportCard from "@/components/reports/ReportCard";
import ReportModal from "@/components/reports/ReportModal";

type Report = Awaited<ReturnType<typeof getReports>>[number];
type Application = Awaited<ReturnType<typeof getApplications>>[number];

type ReportsClientProps = {
  initialReports: Report[];
  applications: Application[];
};

export default function ReportsClient({
  initialReports,
  applications,
}: ReportsClientProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingReport, setEditingReport] = useState<Report | null>(null);

  async function handleSaveReport(report: ReportFormData) {
    if (editingReport) {
      await updateReport(
        editingReport.id,
        report.applicationId,
        report.recommendation,
        report.notes,
      );
    } else {
      await createReport(
        report.applicationId,
        report.recommendation,
        report.notes,
      );
    }

    setEditingReport(null);
    setIsModalOpen(false);

    router.refresh();
  }

  function handleEditReport(id: number) {
    const report = initialReports.find((report) => report.id === id);

    if (!report) return;

    setEditingReport(report);
    setIsModalOpen(true);
  }

  async function handleDeleteReport(id: number) {
    await deleteReport(id);

    router.refresh();
  }

  const filteredReports = initialReports.filter((report) => {
    const query = search.toLowerCase();

    return (
      report.application.candidate.name.toLowerCase().includes(query) ||
      report.application.job.title.toLowerCase().includes(query) ||
      report.application.job.company.name.toLowerCase().includes(query) ||
      report.recommendation.toLowerCase().includes(query)
    );
  });

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-black">Reports</h1>

          <p className="mt-2 text-zinc-600">
            Manage evaluation reports across applications.
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
          + Add Report
        </button>
      </div>

      <div className="mt-8">
        <input
          type="text"
          placeholder="Search reports..."
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

      {filteredReports.length === 0 ? (
        <div className="mt-10">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20">
            <h2 className="text-2xl font-bold text-black">
              No reports found
            </h2>

            <p className="mt-3 text-center text-zinc-600">
              Try a different search or create a new report.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredReports.map((report) => (
            <ReportCard
              key={report.id}
              id={report.id}
              candidateName={report.application.candidate.name}
              jobTitle={report.application.job.title}
              companyName={report.application.job.company.name}
              recommendation={report.recommendation}
              notes={report.notes}
              onEdit={handleEditReport}
              onDelete={handleDeleteReport}
            />
          ))}
        </div>
      )}

      <ReportModal
        isOpen={isModalOpen}
        onClose={() => {
          setEditingReport(null);
          setIsModalOpen(false);
        }}
        onCreate={handleSaveReport}
        applications={applications}
        initialValues={
          editingReport
            ? {
                applicationId: editingReport.applicationId,
                recommendation: editingReport.recommendation,
                notes: editingReport.notes,
              }
            : undefined
        }
      />
    </DashboardLayout>
  );
}
