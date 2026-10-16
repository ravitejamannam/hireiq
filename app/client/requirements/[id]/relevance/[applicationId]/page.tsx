import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Relevance",
};

import Link from "next/link";
import { notFound } from "next/navigation";

import HumanRelevancePanel from "@/components/client/HumanRelevancePanel";
import { requireClientPortal } from "@/lib/auth/authorization";
import { loadHumanRelevanceCollection } from "@/lib/relevance/human-relevance-operations";

type BlindRelevancePageProps = {
  params: Promise<{
    id: string;
    applicationId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BlindRelevanceCollectionPage({
  params,
  searchParams,
}: BlindRelevancePageProps) {
  void searchParams;

  const client = await requireClientPortal();
  const { id, applicationId: applicationIdParam } = await params;
  const jobId = Number(id);
  const applicationId = Number(applicationIdParam);
  if (
    !Number.isInteger(jobId) ||
    jobId <= 0 ||
    !Number.isInteger(applicationId) ||
    applicationId <= 0
  ) {
    notFound();
  }

  const collection = await loadHumanRelevanceCollection({
    companyId: client.companyId,
    jobId,
    applicationId,
  });
  if (!collection || collection.evidence.length === 0) {
    notFound();
  }

  return (
    <div>
      <Link
        href={`/client/requirements/${jobId}`}
        className="mb-6 inline-block text-sm font-medium text-zinc-600 underline underline-offset-2 hover:text-black"
      >
        ← Back to requirement
      </Link>
      <HumanRelevancePanel
        applicationId={collection.applicationId}
        specificationId={collection.specificationId}
        jobTitle={collection.jobTitle}
        candidateName={collection.candidateName}
        requirements={collection.requirements}
        evidence={collection.evidence}
        pipelineNotice="This judgment does not change pipeline status."
      />
    </div>
  );
}
