import Link from "next/link";
import { PortalRole } from "@prisma/client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StatCard from "@/components/dashboard/StatCard";
import {
  formatJobDateTime,
  getSlaStatus,
  requirementLifecycleLabels,
} from "@/components/jobs/JobCard";
import { requireUser } from "@/lib/auth/authorization";
import { getDashboardStats } from "@/lib/repositories/dashboard-repository";

const portalRoleLabels: Record<PortalRole, string> = {
  ADMIN: "Admin",
  CLIENT: "Client",
  INTERVIEWER: "Interviewer",
};

export default async function DashboardPage() {
  const [user, stats] = await Promise.all([
    requireUser(),
    getDashboardStats(),
  ]);

  return (
    <DashboardLayout>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {portalRoleLabels[user.role]}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Command Center</h1>
        <p className="mt-2 text-zinc-600">
          Operational overview across requirements, candidates, and sourcing
          SLA.
        </p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Active Requirements" value={stats.activeRequirements} />
        <StatCard
          title="Candidates in Pipeline"
          value={stats.pipelineCandidates}
        />
        <StatCard title="Shortlisted" value={stats.shortlisted} />
        <StatCard title="Selected" value={stats.selected} />
        <StatCard title="SLA At Risk" value={stats.slaAtRisk} />
      </div>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-black">Active Requirements</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Open roles currently moving through the hiring workflow.
            </p>
          </div>
          <Link
            href="/dashboard/requirements"
            className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100"
          >
            View all requirements
          </Link>
        </div>

        {stats.openRequirements.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
            <p className="text-lg font-medium text-black">No open requirements</p>
            <p className="mt-2 text-sm text-zinc-500">
              Post a role to start recruiting from the Requirements workspace.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {stats.openRequirements.map((requirement) => {
              const slaStatus = getSlaStatus({
                shortlistingCompletedAt: requirement.shortlistingCompletedAt,
                shortlistingDueAt: requirement.shortlistingDueAt,
              });

              return (
                <article
                  key={requirement.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-black"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-black">
                        {requirement.title}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-600">
                        {requirement.company.name}
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                      {requirementLifecycleLabels[requirement.requirementLifecycle]}
                    </span>
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-black">Profiles</dt>
                      <dd>{requirement._count.applications}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Interviewer</dt>
                      <dd>
                        {requirement.assignedInterviewer?.name ?? "Not assigned"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">SLA</dt>
                      <dd>
                        {slaStatus === "OVERDUE"
                          ? "At risk"
                          : slaStatus === "COMPLETED"
                            ? "Completed"
                            : slaStatus === "ACTIVE"
                              ? "Active"
                              : "Not started"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Due</dt>
                      <dd>
                        {requirement.shortlistingDueAt
                          ? formatJobDateTime(requirement.shortlistingDueAt)
                          : "Not set"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5">
                    <Link
                      href={`/dashboard/requirements/${requirement.id}`}
                      className="text-sm font-semibold text-black underline underline-offset-2"
                    >
                      Open requirement workspace
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}
