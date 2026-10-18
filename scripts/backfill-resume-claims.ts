/**
 * Create skill claims and match runs for parsed resumes that have none.
 * Usage: pnpm exec tsx scripts/backfill-resume-claims.ts
 */
import { backfillUnanalysedResumes } from "@/lib/resumes/analyse-after-parse";

async function main() {
  const result = await backfillUnanalysedResumes();
  console.info(JSON.stringify({ event: "resume_claim_backfill", ...result }));
}

main().catch((error) => {
  console.error("[backfill-resume-claims] failed", error);
  process.exitCode = 1;
});
