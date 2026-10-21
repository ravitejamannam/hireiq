import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loadImportContext } from "@/app/actions/applicant-import-actions";
import ApplicantImportWizard from "@/components/imports/ApplicantImportWizard";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { AuthorizationError } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Import applicants" };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ApplicantImportPage({ params }: PageProps) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || jobId < 1) notFound();

  let context: Awaited<ReturnType<typeof loadImportContext>>;
  try {
    context = await loadImportContext(jobId);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { title: true },
  });
  if (!job) notFound();

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Link href={`/dashboard/jobs/${jobId}/review`} className="text-sm text-zinc-600 underline">
          Back to review
        </Link>
        <Link href={`/dashboard/jobs/${jobId}/inbound`} className="ml-4 text-sm text-zinc-600 underline">
          Inbound email
        </Link>
        <h1 className="text-2xl font-bold text-black">Import applicants</h1>
        <ApplicantImportWizard
          jobId={jobId}
          jobTitle={job.title}
          savedTemplates={context.templates}
        />
        {context.batches.length > 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-bold">Earlier imports</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              {context.batches.map((batch) => (
                <li key={batch.id}>
                  {batch.fileName}: {batch.status}, created {batch.createdCount}, attached {batch.attachedCount},
                  skipped {batch.skippedCount}, failed {batch.failedCount}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
