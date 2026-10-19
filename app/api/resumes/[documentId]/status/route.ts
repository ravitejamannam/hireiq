import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { clientParseStatus } from "@/lib/resumes/resume-parse-job";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  }
  const { documentId } = await context.params;
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  }
  const document = await prisma.candidateResumeDocument.findFirst({
    where: { id, ...(admin.companyId == null ? {} : { companyId: admin.companyId }) },
    select: { parseStatus: true, parseErrorCode: true, fieldsNeedReview: true, fileName: true },
  });
  if (!document) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });
  return NextResponse.json(
    {
      ok: true,
      fileName: document.fileName,
      parseStatus: clientParseStatus(document.parseStatus),
      parseErrorCode: document.parseErrorCode,
      fieldsNeedReview: document.fieldsNeedReview,
    },
    { headers: NO_STORE },
  );
}
