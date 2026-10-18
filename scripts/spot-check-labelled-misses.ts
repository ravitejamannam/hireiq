import { loadLabelledResumes } from "@/lib/resumes/labelled-fixtures";
import { heuristicResumeFields } from "@/lib/resumes/resume-field-extractor";

async function main() {
  const samples = await loadLabelledResumes();
  const misses: Array<{ id: string; field: string; expected: string; inText: boolean }> = [];
  for (const sample of samples) {
    const parsed = heuristicResumeFields(sample.text);
    const got = {
      titles: parsed?.experience.map((role) => role.title.value) ?? [],
      companies: parsed?.experience.flatMap((role) => (role.organization ? [role.organization.value] : [])) ?? [],
      skills: parsed?.skills.map((skill) => skill.value) ?? [],
      credentials: parsed?.education.map((school) => school.credential.value) ?? [],
    };
    for (const field of ["titles", "companies", "skills", "credentials"] as const) {
      for (const expected of sample[field]) {
        if (got[field].includes(expected)) continue;
        misses.push({
          id: sample.id,
          field,
          expected: expected.replace(/\s+/g, " ").trim().slice(0, 80),
          inText: sample.text.includes(expected.trim()),
        });
      }
    }
  }
  const sample = ["titles", "companies", "skills", "credentials"].flatMap((field) =>
    misses.filter((row) => row.field === field).slice(0, 3),
  );
  console.log(
    JSON.stringify(
      {
        missCount: misses.length,
        labelStillInText: misses.filter((row) => row.inText).length,
        labelMissingFromText: misses.filter((row) => !row.inText).length,
        sample,
      },
      null,
      2,
    ),
  );
}

main();
