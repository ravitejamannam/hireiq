import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { sendOutboundEmail } from "@/lib/communication/email-transport";
import {
  flagKey,
  newFlagKeys,
  overrideGap,
  requirementGap,
  stageReport,
  FAIRNESS_STAGES,
  type FairnessPerson,
  type FairnessStage,
} from "@/lib/fairness/impact";
import { selfIdentificationsForCompany } from "@/lib/fairness/self-id";
import { prisma } from "@/lib/prisma";

const DIMENSIONS = ["gender", "ageBand", "disability", "region"] as const;

function passedStage(person: {
  status: string;
  coverage: number;
  interviewed: boolean;
  invited: boolean;
}, stage: FairnessStage) {
  if (stage === "applied") return true;
  if (stage === "aiShortlist") return person.coverage >= 0.5;
  if (stage === "advanced") return person.status !== "CV_POOL";
  if (stage === "interviewed") return person.interviewed;
  if (stage === "offer") return person.status === "SELECTED" || person.status === "HIRED";
  return person.invited;
}

export async function recordCompanyFairness(companyId: number) {
  const [identities, applications, invites, grades] = await Promise.all([
    selfIdentificationsForCompany(companyId),
    prisma.application.findMany({
      where: { companyId },
      select: {
        id: true,
        jobId: true,
        candidateId: true,
        status: true,
        interviews: { select: { id: true } },
        matchRuns: {
          orderBy: { id: "desc" },
          take: 1,
          select: { requirementMatches: { select: { requirementKey: true, result: true } } },
        },
      },
    }),
    prisma.talentRediscoveryInvite.findMany({ where: { companyId }, select: { candidateId: true, jobId: true } }),
    prisma.generatedAssessmentInvite.findMany({
      where: { assessment: { companyId }, submittedAt: { not: null } },
      select: { applicationId: true, grades: true },
    }),
  ]);
  const identityByCandidate = new Map(identities.map((row) => [row.candidateId, row]));
  const invited = new Set(invites.map((row) => `${row.jobId}:${row.candidateId}`));
  const overrideByApplication = new Map(grades.map((row) => {
    const list = Array.isArray(row.grades) ? row.grades as Array<{ overrideReason?: string; score?: number }> : [];
    const scores = list.flatMap((grade) => (typeof grade.score === "number" ? [grade.score] : []));
    return [row.applicationId, {
      graded: list.length > 0,
      score: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      override: list.some((grade) => Boolean(grade.overrideReason)),
    }] as const;
  }));

  const peopleByDimension = new Map<string, FairnessPerson[]>();
  for (const dimension of DIMENSIONS) peopleByDimension.set(dimension, []);

  for (const application of applications) {
    const identity = identityByCandidate.get(application.candidateId);
    if (!identity) continue;
    const matches = application.matchRuns[0]?.requirementMatches ?? [];
    const satisfied = matches.filter((match) => match.result === "SATISFIED").length;
    const coverage = matches.length === 0 ? 0 : satisfied / matches.length;
    const base = {
      status: application.status,
      coverage,
      interviewed: application.interviews.length > 0,
      invited: invited.has(`${application.jobId}:${application.candidateId}`),
    };
    for (const dimension of DIMENSIONS) {
      const group = identity[dimension];
      if (!group || group === "prefer_not") continue;
      peopleByDimension.get(dimension)?.push({
        jobId: application.jobId,
        group,
        applied: true,
        aiShortlist: passedStage(base, "aiShortlist"),
        advanced: passedStage(base, "advanced"),
        interviewed: passedStage(base, "interviewed"),
        offer: passedStage(base, "offer"),
        rediscoveryInvite: passedStage(base, "rediscoveryInvite"),
        aiGrade: overrideByApplication.get(application.id)?.graded ? (overrideByApplication.get(application.id)?.score ?? 0) : null,
        humanOverride: overrideByApplication.get(application.id)?.override ?? false,
        requirements: matches.map((match) => ({ key: match.requirementKey, passed: match.result === "SATISFIED" })),
      });
    }
  }

  const previous = await prisma.fairnessSnapshot.findFirst({
    where: { companyId },
    orderBy: { computedAt: "desc" },
    select: { report: true },
  });
  const previousFlags = Array.isArray((previous?.report as { flags?: unknown } | null)?.flags)
    ? ((previous?.report as { flags: string[] }).flags)
    : [];

  const jobs = [...new Set([...peopleByDimension.values()].flatMap((rows) => rows.map((row) => row.jobId)))];
  const sections = [];
  const flags: string[] = [];
  for (const jobId of jobs) {
    for (const dimension of DIMENSIONS) {
      const people = (peopleByDimension.get(dimension) ?? []).filter((person) => person.jobId === jobId);
      if (people.length === 0) continue;
      const stages = FAIRNESS_STAGES.map((stage) => stageReport(people, stage));
      for (const stage of stages) {
        if (!stage.flagged) continue;
        const key = flagKey({ jobId, dimension, stage: stage.stage });
        flags.push(key);
      }
      const gap = requirementGap(people);
      const overrides = overrideGap(people);
      sections.push({
        jobId,
        dimension,
        stages,
        requirement: gap,
        overrides,
        undisclosed: identities.filter((row) => row[dimension] === "prefer_not").length,
      });
    }
  }

  const fresh = newFlagKeys(previousFlags, flags);
  const report = { sections, flags, fresh };
  await prisma.fairnessSnapshot.create({ data: { companyId, report } });
  if (fresh.length > 0) await alertFlags(companyId, fresh);
  return report;
}

async function alertFlags(companyId: number, flags: string[]) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true }, take: 20 });
  const actor = admins[0];
  if (!actor) return;
  const text = `A new adverse-impact flag needs a look: ${flags.join(", ")}. Open the fairness dashboard. This does not change any candidate's outcome.`;
  for (const admin of admins) {
    await sendOutboundEmail({
      to: admin.email,
      subject: "Adverse-impact flag",
      text,
      html: `<p>${text}</p>`,
    });
  }
  await writeAuditLog(prisma, {
    actorUserId: actor.id,
    actorRole: "ADMIN",
    companyId,
    action: "FAIRNESS_FLAG",
    targetType: "COMPANY",
    targetId: companyId,
    reason: flags.join(", ").slice(0, 500),
  });
}

export async function latestFairness() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const reports = [];
  for (const company of companies) {
    const snapshot = await prisma.fairnessSnapshot.findFirst({
      where: { companyId: company.id },
      orderBy: { computedAt: "desc" },
    });
    if (!snapshot) continue;
    const history = await prisma.fairnessSnapshot.findMany({
      where: { companyId: company.id },
      orderBy: { computedAt: "asc" },
      take: 12,
      select: { computedAt: true, report: true },
    });
    reports.push({ company, snapshot, history });
  }
  return reports;
}

export async function reviewFlaggedRequirement(input: {
  companyId: number;
  jobId: number;
  requirementKey: string;
  reason: string;
  actorUserId: number;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("A reason is required.");
  await prisma.fairnessReview.create({
    data: {
      companyId: input.companyId,
      jobId: input.jobId,
      requirementKey: input.requirementKey,
      reason: reason.slice(0, 500),
      actorUserId: input.actorUserId,
    },
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: input.companyId,
    action: "FAIRNESS_REQUIREMENT_REVIEWED",
    targetType: "JOB",
    targetId: input.jobId,
    reason: `${input.requirementKey} | ${reason}`.slice(0, 500),
  });
}
