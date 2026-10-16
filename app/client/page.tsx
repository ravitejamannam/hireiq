import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client",
};

import Link from "next/link";

import ClientRequirementCard from "@/components/client/ClientRequirementCard";
import ClientOnboardingChecklist from "@/components/onboarding/ClientOnboardingChecklist";
import StatCard from "@/components/dashboard/StatCard";
import WorkQueue from "@/components/dashboard/WorkQueue";
import { requireClientPortal } from "@/lib/auth/authorization";
import {
  getClientDashboardAttention,
  getClientDashboardStats,
} from "@/lib/repositories/dashboard-repository";

export default async function ClientDashboardPage() {
  const [client, stats, attention] = await Promise.all([
    requireClientPortal(),
    getClientDashboardStats(),
    getClientDashboardAttention(),
  ]);

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Client portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">
          Hiring at {client.company.name}
        </h1>
        <p className="mt-2 text-zinc-600">
          Decisions waiting on you, {client.name}.
        </p>
      </div>

      {stats.activeRequirements === 0 &&
      stats.profilesInPipeline === 0 &&
      stats.hired === 0 ? (
        <div className="mt-8">
          <ClientOnboardingChecklist />
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Active Requirements" value={stats.activeRequirements} />
        <StatCard
          title="Profiles in Pipeline"
          value={stats.profilesInPipeline}
        />
        <StatCard title="Shortlisted" value={stats.shortlisted} />
        <StatCard title="Selected" value={stats.selected} />
        <StatCard title="Hired" value={stats.hired} />
      </div>

      <div className="mt-8">
        <WorkQueue
          title="Decisions waiting"
          items={attention}
          empty="No shortlist or hire decisions are waiting. New candidates will land here when HireIQ is ready for you."
        />
      </div>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-black">Requirements</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Recent roles for your company and their pipeline progress.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/client/requirements"
              className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100"
            >
              View all requirements
            </Link>
            <Link
              href="/client/requirements"
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              + Post Role
            </Link>
          </div>
        </div>

        {stats.requirements.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <p className="text-lg font-medium text-black">
              You haven&apos;t created a hiring requirement yet.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Create a role to start the HireIQ hiring workflow.
            </p>
            <Link
              href="/client/requirements"
              className="mt-6 inline-flex rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              + Post Role
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {stats.requirements.map((requirement) => (
              <ClientRequirementCard
                key={requirement.id}
                id={requirement.id}
                title={requirement.title}
                companyName={requirement.company.name}
                status={requirement.status}
                requirementLifecycle={requirement.requirementLifecycle}
                location={requirement.location}
                numberOfPositions={requirement.numberOfPositions}
                targetHireDate={requirement.targetHireDate}
                profileCount={requirement._count.applications}
                shortlistedCount={requirement.shortlistedCount}
                selectedCount={requirement.selectedCount}
                pipelineCounts={requirement.pipelineCounts}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
