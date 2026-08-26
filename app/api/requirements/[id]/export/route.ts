import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/requirements/[id]/export — ADMIN: CSV pipeline export. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  }

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
  }
  const jobId = Number.parseInt(id, 10);

  const applications = await prisma.application.findMany({
    where: { jobId },
    select: {
      id: true, status: true, source: true, expertScore: true, createdAt: true,
      candidate: {
        select: { name: true, currentEmployer: true, skills: true, experienceYears: true, location: true },
      },
      assessmentInvite: { select: { attempt: { select: { score: true, maxScore: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const escapeCsv = (v: string | null | undefined) =>
    v ? `"${v.replaceAll('"', '""').replaceAll("\n", "\\n")}"` : "";

  const rows = [
    ["Application ID", "Candidate", "Employer", "Skills", "Experience (yrs)", "Location", "Stage", "Source", "Expert Score", "Assessment Score", "Applied On"],
    ...applications.map((a) => [
      String(a.id),
      escapeCsv(a.candidate.name),
      escapeCsv(a.candidate.currentEmployer),
      escapeCsv(a.candidate.skills),
      String(a.candidate.experienceYears ?? ""),
      escapeCsv(a.candidate.location ?? ""),
      a.status,
      a.source ?? "",
      a.expertScore !== null ? String(a.expertScore) : "",
      a.assessmentInvite?.attempt ? `${a.assessmentInvite.attempt.score}/${a.assessmentInvite.attempt.maxScore}` : "",
      a.createdAt.toISOString().slice(0, 10),
    ]),
  ];

  return new NextResponse(rows.map((r) => r.join(",")).join("\n"), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pipeline-job-${jobId}.csv"`,
    },
  });
}
