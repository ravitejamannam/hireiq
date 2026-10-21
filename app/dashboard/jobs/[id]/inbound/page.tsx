import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loadInboundContext } from "@/app/actions/inbound-email-actions";
import InboundEmailPanel from "@/components/inbound/InboundEmailPanel";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { AuthorizationError } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Inbound email" };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function InboundEmailPage({ params }: PageProps) {
  const jobId = Number((await params).id);
  if (!Number.isInteger(jobId) || jobId < 1) notFound();
  let context: Awaited<ReturnType<typeof loadInboundContext>>;
  try {
    context = await loadInboundContext(jobId);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: { title: true },
  });
  if (!job) notFound();
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Link href={`/dashboard/jobs/${jobId}/import`} className="text-sm text-zinc-600 underline">
          CSV import
        </Link>
        <h1 className="text-2xl font-bold">{job.title}</h1>
        <InboundEmailPanel
          jobId={jobId}
          configured={context.configured}
          route={context.route}
          messages={context.messages}
        />
      </div>
    </DashboardLayout>
  );
}
