import Link from "next/link";

import StatCard from "@/components/dashboard/StatCard";
import {
  clientJobStatusLabels,
  clientRequirementLifecycleLabels,
  formatClientDate,
} from "@/components/client/client-labels";
import { getInterviewerDashboardStats } from "@/lib/repositories/interviewer-portal-repository";

export default async function InterviewerDashboardPage() {
  const stats = await getInterviewerDashboardStats();

  return (
    <div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Interviewer portal
        </p>
        <h1 className="mt-2 text-3xl font-bold text-black">Dashboard</h1>
        <p className="mt-2 text-zinc-600">
          Assigned requirements and evaluation progress.
        </p>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Assigned Requirements"
          value={stats.assignedRequirements}
        />
        <StatCard
          title="Candidates to Review"
          value={stats.candidatesToReview}
        />
        <StatCard
          title="Evaluations In Progress"
          value={stats.evaluationsInProgress}
        />
        <StatCard
          title="Evaluations Completed"
          value={stats.evaluationsCompleted}
        />
      </div>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-black">Assigned Requirements</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Roles currently assigned to you.
            </p>
          </div>
          <Link
            href="/interviewer/requirements"
            className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-100"
          >
            View all requirements
          </Link>
        </div>

        {stats.requirements.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
            <p className="text-lg font-medium text-black">
              No requirements are assigned to you yet.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {stats.requirements.slice(0, 5).map((requirement) => {
              const ownEvaluationCount = requirement.applications.filter(
                (application) => application.evaluations.length > 0,
              ).length;

              return (
                <article
                  key={requirement.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-black">
                        {requirement.title}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-600">
                        {requirement.company.name}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                        {clientJobStatusLabels[requirement.status]}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-black">
                        {
                          clientRequirementLifecycleLabels[
                            requirement.requirementLifecycle
                          ]
                        }
                      </span>
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
                    <div>
                      <dt className="font-medium text-black">Location</dt>
                      <dd>{requirement.location || "Not set"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Candidates</dt>
                      <dd>{requirement._count.applications}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Your evaluations</dt>
                      <dd>{ownEvaluationCount}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-black">Target hire date</dt>
                      <dd>{formatClientDate(requirement.targetHireDate)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <Link
                      href={`/interviewer/requirements/${requirement.id}`}
                      className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                    >
                      Open Requirement
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
