import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blueprint",
};

import Link from "next/link";
import { notFound } from "next/navigation";

import BlueprintEditor from "@/components/interviews/BlueprintEditor";
import BlueprintCopyPanel from "@/components/interviews/BlueprintCopyPanel";
import { listBlueprintSourceOptions } from "@/lib/interviews/blueprint-service";
import { requireAdmin } from "@/lib/auth/authorization";
import { getBlueprintForSpec } from "@/lib/interviews/blueprint-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RequirementBlueprintPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  if (!/^\d+$/.test(id)) notFound();
  const requirementId = Number.parseInt(id, 10);

  const job = await prisma.job.findFirst({
    where: { id: requirementId },
    select: {
      id: true,
      title: true,
      currentPublishedSpecificationVersionId: true,
      currentPublishedSpecificationVersion: { select: { id: true, versionNumber: true } },
    },
  });

  if (!job || !job.currentPublishedSpecificationVersionId) {
    notFound();
  }

  const [blueprint, copySources] = await Promise.all([
    getBlueprintForSpec(job.currentPublishedSpecificationVersionId),
    listBlueprintSourceOptions(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/dashboard/requirements/${requirementId}`}
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          ← Back to requirement
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
          Interview blueprint — {job.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Attached to the published specification (v
          {job.currentPublishedSpecificationVersion?.versionNumber ?? 1}). Editing creates a new
          rubric version; historical interview scores keep their snapshots.
        </p>
      </header>

      {!blueprint ? (
        <BlueprintCopyPanel
          targetSpecVersionId={job.currentPublishedSpecificationVersionId}
          sources={copySources.filter(
            (s) => s.specVersionId !== job.currentPublishedSpecificationVersionId,
          )}
        />
      ) : null}

      <BlueprintEditor
        specVersionId={job.currentPublishedSpecificationVersionId}
        initialCompetencies={
          blueprint?.competencies.map((c) => ({
            name: c.name,
            description: c.description ?? "",
            weight: c.weight,
          })) ?? []
        }
        initialQuestions={
          blueprint?.competencies.flatMap((c) =>
            c.questions.map((q) => ({
              competencyName: c.name,
              question: q.question,
              guidance: q.guidance ?? "",
              difficulty: q.difficulty,
            })),
          ) ?? []
        }
      />
    </div>
  );
}
