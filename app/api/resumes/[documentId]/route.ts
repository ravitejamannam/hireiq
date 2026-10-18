import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { readResume } from "@/lib/resumes/storage";

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const admin = await requireAdmin();
  const { documentId } = await context.params;
  const id = Number(documentId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const document = await prisma.candidateResumeDocument.findFirst({
    where: { id, ...(admin.companyId == null ? {} : { companyId: admin.companyId }) },
    select: { storageKey: true, fileName: true, contentType: true },
  });
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await readResume(document.storageKey);
  if (!bytes) return NextResponse.json({ error: "File missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": document.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${document.fileName.replace(/"/g, "")}"`,
    },
  });
}
