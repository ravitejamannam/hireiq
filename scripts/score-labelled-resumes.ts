/**
 * Score redacted resumes you labelled by hand.
 *
 * Put one JSON file per resume in lib/resumes/fixtures/labelled/:
 * { "id": "naukri-01", "text": "...", "titles": ["Software Engineer", "Analyst"], "companies": ["Example", "Northwind"], "skills": ["React", "SQL"], "credentials": ["B.Tech"], "projects": ["Hiring Portal"] }
 *
 * Redact the text with redactResumeFixture before it is committed.
 *
 * Usage: pnpm exec tsx scripts/score-labelled-resumes.ts
 */
import { scoreLabelledResumes } from "@/lib/resumes/labelled-fixtures";

async function main() {
  const result = await scoreLabelledResumes();
  console.info(JSON.stringify({ event: "resume_labelled_accuracy", ...result }));
  if (result.count === 0) {
    console.info("No labelled resumes yet. Add redacted JSON files under lib/resumes/fixtures/labelled.");
  }
}

main().catch((error) => {
  console.error("[score-labelled-resumes] failed", error);
  process.exitCode = 1;
});
