/**
 * Re-read stored resume binaries with the current extractor.
 *
 * Dry run is the default. It prints what would change and writes nothing.
 * Apply with REPARSE_APPLY=1.
 *
 * A new extract replaces the saved text only when its quality score is
 * strictly higher. Equal or lower scores keep the saved text. A failed
 * extract writes nothing, so the row stays eligible. Apply updates only
 * when the text and extractor version still match the values that were read.
 *
 * Usage: pnpm exec tsx scripts/reparse-resumes.ts
 * Optional: REPARSE_LIMIT=50 REPARSE_APPLY=1
 */
import { planReparse, reparseUpdateWhere } from "@/lib/resumes/reparse-plan";
import { prisma } from "@/lib/prisma";
import { readResume } from "@/lib/resumes/storage";
import type { ResumeVisionAudit } from "@/lib/resumes/layout-vision";
import {
  extractResumeText,
  RESUME_TEXT_EXTRACTOR_VERSION,
} from "@/lib/resumes/text-extraction";

async function main() {
  const apply = process.env.REPARSE_APPLY === "1";
  const limit = Number.parseInt(process.env.REPARSE_LIMIT ?? "100", 10);
  const rows = await prisma.candidateResumeDocument.findMany({
    where: {
      OR: [
        { extractorVersion: null },
        { extractorVersion: { not: RESUME_TEXT_EXTRACTOR_VERSION } },
      ],
    },
    orderBy: { id: "asc" },
    take: Number.isFinite(limit) && limit > 0 ? limit : 100,
    select: {
      id: true,
      companyId: true,
      applicationId: true,
      storageKey: true,
      fileName: true,
      contentType: true,
      extractedText: true,
      extractorVersion: true,
    },
  });

  let updated = 0;
  let kept = 0;
  let failed = 0;
  for (const row of rows) {
    const bytes = await readResume(row.storageKey);
    if (!bytes) {
      console.info(JSON.stringify({ event: "resume_reparse", id: row.id, status: "MISSING_BINARY", apply }));
      failed += 1;
      continue;
    }
    const extraction = await extractResumeText(bytes, {
      fileName: row.fileName,
      contentType: row.contentType,
      ocr: "skip",
      visionAudit: {
        companyId: row.companyId,
        entityType: row.applicationId ? "Application" : "CandidateResumeDocument",
        entityId: row.applicationId ?? row.id,
        applicationId: row.applicationId,
        db: prisma as unknown as ResumeVisionAudit["db"],
      },
    });
    const plan = planReparse({
      extractedText: row.extractedText,
      extraction,
      currentVersion: RESUME_TEXT_EXTRACTOR_VERSION,
    });
    if (plan.action === "fail") {
      console.info(
        JSON.stringify({
          event: "resume_reparse",
          id: row.id,
          status: "FAILED",
          errorCode: plan.errorCode,
          apply,
        }),
      );
      failed += 1;
      continue;
    }
    if (plan.action === "keep") {
      console.info(
        JSON.stringify({
          event: "resume_reparse",
          id: row.id,
          status: "KEPT_PREVIOUS",
          previousScore: plan.previousScore,
          nextScore: plan.nextScore,
          apply,
        }),
      );
      kept += 1;
      continue;
    }
    console.info(
      JSON.stringify({
        event: "resume_reparse",
        id: row.id,
        status: "UPDATE",
        previousScore: plan.previousScore,
        nextScore: plan.nextScore,
        apply,
      }),
    );
    if (apply) {
      const result = await prisma.candidateResumeDocument.updateMany({
        where: reparseUpdateWhere({
          id: row.id,
          extractedText: row.extractedText,
          extractorVersion: row.extractorVersion,
        }),
        data: plan.data,
      });
      if (result.count === 0) {
        console.info(
          JSON.stringify({
            event: "resume_reparse",
            id: row.id,
            status: "SKIPPED_CHANGED",
            apply,
          }),
        );
        continue;
      }
    }
    updated += 1;
  }

  console.info(
    JSON.stringify({
      event: "resume_reparse_done",
      apply,
      extractorVersion: RESUME_TEXT_EXTRACTOR_VERSION,
      updated,
      kept,
      failed,
    }),
  );
}

main()
  .catch((error) => {
    console.error("[reparse-resumes] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
