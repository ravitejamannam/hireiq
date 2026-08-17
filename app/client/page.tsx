import Link from "next/link";

import ClientRequirementCard from "@/components/client/ClientRequirementCard";
import CreateFirstRoleForm from "@/components/client/CreateFirstRoleForm";
import StatCard from "@/components/dashboard/StatCard";
import { requireClientPortal } from "@/lib/auth/authorization";
import { getClientDashboardStats } from "@/lib/repositories/dashboard-repository";

export default async function ClientDashboardPage() {
  const [client, stats] = await Promise.all([
    requireClientPortal(),
    getClientDashboardStats(),
  ]);

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Client portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">
          Welcome back, {client.name}
        </h1>
        <p className="mt-2 text-zinc-600">
          Recruitment overview for {client.company.name}.
        </p>
      </div>

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

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-black">Requirements</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Recent roles for your company and their pipeline progress.
            </p>
          </div>
          <Link
            href="/client/requirements"
            className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100"
          >
            View all requirements
          </Link>
        </div>

        {stats.requirements.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <p className="text-lg font-medium text-black">
              You haven&apos;t created a hiring requirement yet.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Create a draft role to start the HireIQ hiring workflow.
            </p>
            <div className="mx-auto mt-4 max-w-md text-left">
              <CreateFirstRoleForm />
            </div>
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
