import { notFound } from "next/navigation";

import AssessmentDraftEditor from "@/components/assessments/AssessmentDraftEditor";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ id: string }> };

export default async function JobAssessmentPage({ params }: PageProps) {
  const jobId = Number((await params).id);
  if (!Number.isInteger(jobId)) notFound();
  const admin = await requireAdmin();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { title: true, companyId: true } });
  if (!job || deniesCrossCompany(admin, job.companyId)) notFound();
  const assessment = await prisma.generatedAssessment.findFirst({
    where: { jobId },
    orderBy: { version: "desc" },
  });
  const items = Array.isArray(assessment?.items) ? assessment.items : [];
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <AssessmentDraftEditor
        jobId={jobId}
        jobTitle={job.title}
        assessmentId={assessment?.id ?? null}
        status={assessment?.status ?? "NONE"}
        timeLimitMinutes={assessment?.timeLimitMinutes ?? 45}
        items={items as Array<{ id: string; type: string; prompt: string; requirement: string; rubricCriterion: string }>}
      />
      <CopilotPanel jobId={jobId} companyId={job.companyId} />
    </main>
  );
}
