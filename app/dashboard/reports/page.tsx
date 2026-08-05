"use client";

import { useState } from "react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ReportCard from "@/components/reports/ReportCard";
import { reports } from "@/data/reports";

export default function ReportsPage() {
  const [search, setSearch] = useState("");

  const filteredReports = reports.filter((report) =>
    report.candidate.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold text-black">Reports</h1>

        <p className="mt-2 text-zinc-600">
          AI interview reports and candidate evaluations.
        </p>
      </div>

      <div className="mt-8">
        <input
          type="text"
          placeholder="Search reports..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-black"
        />
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredReports.map((report) => (
          <ReportCard
            key={report.id}
            candidate={report.candidate}
            company={report.company}
            score={report.score}
            result={report.result}
          />
        ))}
      </div>
    </DashboardLayout>
  );
}
