import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import {
  isResumeUploadActionError,
  resumeUploadActionErrorMessage,
  uploadResumeForAdmin,
} from "@/lib/resumes/resume-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 10 * 1024 * 1024 + 64 * 1024; // file + multipart overhead

/**
 * POST /api/resumes/upload — ADMIN only.
 * Multipart form: file (required), candidateId (required), applicationId (optional).
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Upload too large." },
        { status: 413, headers: NO_STORE },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "A resume file is required." },
        { status: 400, headers: NO_STORE },
      );
    }
    const candidateId = form.get("candidateId");
    const applicationId = form.get("applicationId");

    const result = await uploadResumeForAdmin({
      candidateId,
      applicationId,
      actorUserId: admin.id,
      file: {
        name: file.name,
        type: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
      },
    });

    return NextResponse.json({ ok: true as const, document: result }, { headers: NO_STORE });
  } catch (error) {
    if (isResumeUploadActionError(error)) {
      return NextResponse.json(
        { ok: false, error: resumeUploadActionErrorMessage(error) },
        { status: 400, headers: NO_STORE },
      );
    }
    console.error("[resume-upload] failed", error);
    return NextResponse.json(
      { ok: false, error: "Resume upload failed." },
      { status: 500, headers: NO_STORE },
    );
  }
}
