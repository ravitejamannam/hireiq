import { NextResponse } from "next/server";

import { resolveCompanyFromApiKey } from "@/lib/api/api-keys";
import { callMcpTool, mcpTools } from "@/lib/mcp/readonly-server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const companyId = await resolveCompanyFromApiKey(request.headers.get("authorization"));
  if (!companyId) return NextResponse.json({ ok: false, error: "Invalid or revoked API key." }, { status: 401 });
  return NextResponse.json({ ok: true, tools: mcpTools() });
}

export async function POST(request: Request) {
  const companyId = await resolveCompanyFromApiKey(request.headers.get("authorization"));
  if (!companyId) return NextResponse.json({ ok: false, error: "Invalid or revoked API key." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { tool?: string; question?: string; jobId?: number } | null;
  const jobId = Number(body?.jobId ?? 0);
  const job = Number.isInteger(jobId) && jobId > 0
    ? await prisma.job.findFirst({
        where: { id: jobId, companyId },
        select: { id: true, title: true, companyId: true, applications: { take: 200, select: { status: true } } },
      })
    : null;
  const counts: Record<string, number> = {};
  for (const row of job?.applications ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  const result = callMcpTool({
    tool: body?.tool ?? "",
    question: body?.question ?? "",
    actorCompanyId: companyId,
    jobCompanyId: job?.companyId ?? -1,
    job: job ? { id: job.id, title: job.title, counts } : null,
    candidates: [],
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "Job not found." ? 404 : 400 });
  return NextResponse.json({ ok: true, data: result.data });
}
