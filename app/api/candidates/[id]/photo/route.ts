import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  requireCandidateAccess,
} from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { readResume } from "@/lib/resumes/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const candidateId = Number(id);
  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const { candidate } = await requireCandidateAccess(candidateId);
    const profile = await prisma.candidateProfile.findFirst({
      where: { candidateId: candidate.id, companyId: candidate.companyId },
      select: { photoStorageKey: true, photoContentType: true },
    });
    if (!profile?.photoStorageKey) {
      return new NextResponse(null, { status: 404 });
    }
    const bytes = await readResume(profile.photoStorageKey);
    if (!bytes) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": profile.photoContentType || "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      return new NextResponse(null, { status: 404 });
    }
    throw error;
  }
}
