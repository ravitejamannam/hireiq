/**
 * Local sample for the fairness dashboard. Not part of deploy or db:bootstrap-dev.
 * Refuses to run in production so a customer database cannot receive this fake flag.
 *
 *   HIREIQ_DEV_SEED=1 pnpm exec tsx scripts/seed-fairness-sample.ts
 */
import { prisma } from "../lib/prisma";
import { FAIRNESS_STAGES, flagKey, requirementGap, stageReport, type FairnessPerson } from "../lib/fairness/impact";

function row(group: string, index: number, shortlisted: boolean): FairnessPerson {
  return {
    jobId: 1,
    group,
    applied: true,
    aiShortlist: shortlisted,
    advanced: shortlisted,
    interviewed: false,
    offer: false,
    rediscoveryInvite: group === "men" ? index < 24 : index < 12,
    aiGrade: 3,
    humanOverride: group === "women" && index < 20,
    requirements: [
      { key: "years:5-9", passed: group === "men" },
      { key: "skill:go", passed: true },
    ],
  };
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing to write the fairness sample in production.");
  }
  if (process.env.HIREIQ_DEV_SEED !== "1") {
    throw new Error("Set HIREIQ_DEV_SEED=1 to write the local fairness sample.");
  }
  const people: FairnessPerson[] = [];
  for (let index = 0; index < 40; index += 1) {
    people.push(row("women", index, index < 16));
    people.push(row("men", index, index < 32));
  }
  const stages = FAIRNESS_STAGES.map((stage) => stageReport(people, stage));
  const overrides = stageReport(people.map((person) => ({ ...person, applied: true, aiShortlist: person.humanOverride })), "aiShortlist");
  const flags = stages.filter((stage) => stage.flagged).map((stage) => flagKey({ jobId: 1, dimension: "gender", stage: stage.stage }));
  if (overrides.flagged) flags.push(flagKey({ jobId: 1, dimension: "gender", stage: "aiShortlist" }) + ":overrides");
  await prisma.fairnessSnapshot.create({
    data: {
      companyId: 1,
      jobId: 1,
      report: {
        sample: true,
        sections: [{ jobId: 1, dimension: "gender", stages, requirement: requirementGap(people), overrides }],
        flags,
        fresh: [],
      },
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
