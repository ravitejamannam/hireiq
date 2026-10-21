/**
 * Names shared by the E2E seed scripts. e2e-full-followup.ts CREATES these applicants (50 per company, through the
 * hosted apply form) and e2e-remaining-flows.ts LOOKS THEM UP, so followup must run first.
 * e2e-full-run.ts uses a different pattern ("Applicant <slug> <n>") for its resume-backed applicants.
 */

/** Seed order. Each script needs rows created by the ones before it. */
export const E2E_SEED_ORDER = [
  "scripts/e2e-full-run.ts",
  "scripts/e2e-second-role.ts",
  "scripts/e2e-full-followup.ts",
  "scripts/e2e-remaining-flows.ts",
  "scripts/e2e-playwright-prep.ts",
] as const;

export function seededApplicantName(slug: string, index: number) {
  return `${slug} Applicant ${index}`;
}

/** The numeric suffix of a seeded applicant name, or null if the name is not one. */
export function seededApplicantIndex(name: string, slug: string): number | null {
  const prefix = `${slug} Applicant `;
  if (!name.startsWith(prefix)) return null;
  const rest = name.slice(prefix.length);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

/** The exact title of a company's first backend role, as created by e2e-full-run.ts. */
export function backendJobTitle(companyName: string) {
  return `${companyName}: Backend Engineer`;
}
