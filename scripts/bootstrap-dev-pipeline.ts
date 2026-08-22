/**
 * Posted requirements and pipeline candidates for local fixture bootstrap.
 * Direct Prisma writes for test data only — not a product workflow path.
 */

import {
  ApplicationPipelineStatus,
  CandidateStatus,
  EvaluationFitDecision,
  Recommendation,
  RequirementLifecycle,
  RoleCategory,
  SourcingDatabaseSource,
  type JobStatus,
} from "@prisma/client";

import { generateBillingForHiredApplication } from "../lib/billing/generate-hire-billing";
import { createPostedJobWithPublishedSpecification } from "../lib/jobs/job-specification";
import { prisma } from "../lib/prisma";

type InterviewerMap = Record<string, number>;

type RequirementKind =
  | "posted"
  | "interviewer_notified"
  | "sourcing_active"
  | "sourcing_hired";

type RequirementSpec = {
  title: string;
  kind: RequirementKind;
  roleCategory: RoleCategory;
  interviewerSlug: string;
  experienceRange: string;
  location: string;
  compensationRange: string;
  primarySkills: string;
  mustHaveRequirements: string;
  niceToHaveRequirements: string;
  jobDescription: string;
  evaluationCriteria: string;
};

const PEOPLE = [
  "Aisha Khan",
  "Rohan Iyer",
  "Meera Nair",
  "Kabir Joshi",
  "Sana Reddy",
  "Vihaan Shah",
  "Diya Menon",
  "Arnav Gupta",
  "Ishita Bose",
  "Reyansh Patel",
  "Ananya Rao",
  "Dev Malhotra",
  "Kiara Das",
  "Aditya Verma",
  "Myra Kapoor",
  "Shaurya Singh",
  "Tara Bhat",
  "Yash Agarwal",
  "Navya Pillai",
  "Ishaan Kulkarni",
  "Pari Mehta",
  "Krish Nambiar",
  "Aarohi Jain",
  "Vivaan Chopra",
  "Saanvi Deshmukh",
  "Atharv Banerjee",
  "Anvi Ghosh",
  "Dhruv Saxena",
  "Pihu Bansal",
  "Ritvik Nair",
  "Avni Sharma",
  "Kabir Rao",
  "Ira Sen",
  "Harshil Shah",
  "Mira Varghese",
  "Neil Kapur",
  "Zara Hussain",
  "Om Prakash",
  "Leela Krishnan",
  "Farhan Qureshi",
] as const;

const ACTIVE_PIPELINE: ApplicationPipelineStatus[] = [
  ...repeatStatus(ApplicationPipelineStatus.CV_POOL, 4),
  ...repeatStatus(ApplicationPipelineStatus.EXPERT_REVIEW, 4),
  ...repeatStatus(ApplicationPipelineStatus.TECH_EVALUATION, 4),
  ...repeatStatus(ApplicationPipelineStatus.SHORTLISTED, 4),
  ...repeatStatus(ApplicationPipelineStatus.SELECTED, 3),
];

const HIRED_PIPELINE: ApplicationPipelineStatus[] = [
  ...repeatStatus(ApplicationPipelineStatus.CV_POOL, 3),
  ...repeatStatus(ApplicationPipelineStatus.EXPERT_REVIEW, 3),
  ...repeatStatus(ApplicationPipelineStatus.TECH_EVALUATION, 3),
  ...repeatStatus(ApplicationPipelineStatus.SHORTLISTED, 3),
  ...repeatStatus(ApplicationPipelineStatus.SELECTED, 3),
  ...repeatStatus(ApplicationPipelineStatus.HIRED, 3),
];

function repeatStatus(status: ApplicationPipelineStatus, count: number) {
  return Array.from({ length: count }, () => status);
}

function candidateStatusFor(
  status: ApplicationPipelineStatus,
): CandidateStatus {
  if (status === ApplicationPipelineStatus.HIRED) {
    return CandidateStatus.HIRED;
  }
  if (status === ApplicationPipelineStatus.SELECTED) {
    return CandidateStatus.OFFER;
  }
  if (status === ApplicationPipelineStatus.REJECTED) {
    return CandidateStatus.REJECTED;
  }
  if (
    status === ApplicationPipelineStatus.TECH_EVALUATION ||
    status === ApplicationPipelineStatus.SHORTLISTED
  ) {
    return CandidateStatus.INTERVIEWING;
  }
  return CandidateStatus.APPLIED;
}

function requirementsFor(companyName: string, slug: string): RequirementSpec[] {
  const catalogs: Record<string, RequirementSpec[]> = {
    acme: [
      spec(companyName, "Platform Engineer", "posted", "ENGINEERING", "priya"),
      spec(
        companyName,
        "Controls Engineer",
        "interviewer_notified",
        "ENGINEERING",
        "neha",
      ),
      spec(
        companyName,
        "Senior Backend Engineer",
        "sourcing_active",
        "ENGINEERING",
        "priya",
      ),
      spec(
        companyName,
        "Staff Robotics Engineer",
        "sourcing_hired",
        "ENGINEERING",
        "neha",
      ),
    ],
    globex: [
      spec(companyName, "Finance Analyst", "posted", "FINANCE", "arjun"),
      spec(
        companyName,
        "Risk Associate",
        "interviewer_notified",
        "FINANCE",
        "arjun",
      ),
      spec(
        companyName,
        "Senior FP&A Manager",
        "sourcing_active",
        "FINANCE",
        "kavya",
      ),
      spec(
        companyName,
        "Treasury Lead",
        "sourcing_hired",
        "FINANCE",
        "arjun",
      ),
    ],
    initech: [
      spec(companyName, "Product Designer", "posted", "DESIGN", "rohan"),
      spec(
        companyName,
        "Brand Designer",
        "interviewer_notified",
        "DESIGN",
        "rohan",
      ),
      spec(
        companyName,
        "Senior UX Designer",
        "sourcing_active",
        "DESIGN",
        "rohan",
      ),
      spec(
        companyName,
        "Design Manager",
        "sourcing_hired",
        "DESIGN",
        "kavya",
      ),
    ],
    umbrella: [
      spec(
        companyName,
        "Clinical Systems Engineer",
        "posted",
        "ENGINEERING",
        "priya",
      ),
      spec(
        companyName,
        "Health Ops Lead",
        "interviewer_notified",
        "SALES",
        "kavya",
      ),
      spec(
        companyName,
        "Senior Data Engineer",
        "sourcing_active",
        "ENGINEERING",
        "arjun",
      ),
      spec(
        companyName,
        "Platform Architect",
        "sourcing_hired",
        "ENGINEERING",
        "neha",
      ),
    ],
    stark: [
      spec(
        companyName,
        "Manufacturing Engineer",
        "posted",
        "ENGINEERING",
        "neha",
      ),
      spec(
        companyName,
        "Quality Lead",
        "interviewer_notified",
        "ENGINEERING",
        "priya",
      ),
      spec(
        companyName,
        "Senior Plant Engineer",
        "sourcing_active",
        "ENGINEERING",
        "neha",
      ),
      spec(
        companyName,
        "Operations Manager",
        "sourcing_hired",
        "SALES",
        "kavya",
      ),
    ],
    wayne: [
      spec(companyName, "Account Executive", "posted", "SALES", "kavya"),
      spec(
        companyName,
        "Content Designer",
        "interviewer_notified",
        "DESIGN",
        "rohan",
      ),
      spec(
        companyName,
        "Senior Media Producer",
        "sourcing_active",
        "SALES",
        "kavya",
      ),
      spec(
        companyName,
        "Editorial Lead",
        "sourcing_hired",
        "DESIGN",
        "rohan",
      ),
    ],
  };

  return catalogs[slug] ?? catalogs.acme;
}

function spec(
  companyName: string,
  title: string,
  kind: RequirementKind,
  roleCategory: RoleCategory,
  interviewerSlug: string,
): RequirementSpec {
  return {
    title: `${companyName}: ${title}`,
    kind,
    roleCategory,
    interviewerSlug,
    experienceRange: "4-8 years",
    location: "Bengaluru",
    compensationRange: "₹25-40 LPA",
    primarySkills: `${title}, stakeholder management, written communication`,
    mustHaveRequirements: `Hands-on experience as a ${title.toLowerCase()} and ownership of delivery.`,
    niceToHaveRequirements: "Experience hiring or mentoring, and comfort with async collaboration.",
    jobDescription: `${companyName} is hiring a ${title} to own delivery across the current hiring cycle.`,
    evaluationCriteria:
      "Problem solving, communication, role depth, and evidence of recent delivery.",
  };
}

function lifecycleFor(kind: RequirementKind): RequirementLifecycle {
  if (kind === "interviewer_notified") {
    return RequirementLifecycle.INTERVIEWER_NOTIFIED;
  }
  if (kind === "sourcing_active" || kind === "sourcing_hired") {
    return RequirementLifecycle.SOURCING_SHORTLISTING;
  }
  return RequirementLifecycle.REQUIREMENT_POSTED;
}

function pipelineFor(kind: RequirementKind): ApplicationPipelineStatus[] {
  if (kind === "sourcing_active") {
    return ACTIVE_PIPELINE;
  }
  if (kind === "sourcing_hired") {
    return HIRED_PIPELINE;
  }
  return [];
}

export async function seedCompanyPipeline(input: {
  companyId: number;
  companyName: string;
  companySlug: string;
  ownerUserId: number;
  interviewers: InterviewerMap;
}): Promise<{ jobsCreated: number; candidatesCreated: number }> {
  const hireDate = new Date();
  hireDate.setUTCDate(hireDate.getUTCDate() + 60);

  let jobsCreated = 0;
  let candidatesCreated = 0;
  let personIndex = 0;

  for (const requirement of requirementsFor(
    input.companyName,
    input.companySlug,
  )) {
    const interviewerId = input.interviewers[requirement.interviewerSlug];
    if (!interviewerId) {
      throw new Error(
        `Missing interviewer fixture ${requirement.interviewerSlug}.`,
      );
    }

    const job = await ensureRequirement({
      companyId: input.companyId,
      ownerUserId: input.ownerUserId,
      interviewerId,
      hireDate,
      requirement,
    });

    if (job.created) {
      jobsCreated += 1;
    }

    const statuses = pipelineFor(requirement.kind);
    const hiredApplicationIds: number[] = [];

    for (const status of statuses) {
      const name = PEOPLE[personIndex % PEOPLE.length];
      personIndex += 1;
      const seeded = await ensureCandidateApplication({
        companyId: input.companyId,
        jobId: job.id,
        interviewerId,
        name,
        role: requirement.title.replace(`${input.companyName}: `, ""),
        status,
        source:
          personIndex % 2 === 0
            ? SourcingDatabaseSource.LINKEDIN
            : SourcingDatabaseSource.NAUKRI,
      });

      if (seeded.created) {
        candidatesCreated += 1;
      }
      if (status === ApplicationPipelineStatus.HIRED) {
        hiredApplicationIds.push(seeded.applicationId);
      }
    }

    if (hiredApplicationIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const applicationId of hiredApplicationIds) {
          const existingLine = await tx.billingLineItem.findUnique({
            where: { applicationId },
            select: { id: true },
          });
          if (!existingLine) {
            await generateBillingForHiredApplication(tx, applicationId);
          }
        }
      });
    }
  }

  return { jobsCreated, candidatesCreated };
}

async function ensureRequirement(input: {
  companyId: number;
  ownerUserId: number;
  interviewerId: number;
  hireDate: Date;
  requirement: RequirementSpec;
}) {
  const existing = await prisma.job.findFirst({
    where: {
      companyId: input.companyId,
      title: input.requirement.title,
    },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, created: false };
  }

  const sourcing =
    input.requirement.kind === "posted"
      ? {
          sourcingDatabaseSource: null,
          sourcingAccessDetails: null,
        }
      : {
          sourcingDatabaseSource: SourcingDatabaseSource.LINKEDIN,
          sourcingAccessDetails: "Recruiter seat ready for sourced intake.",
        };

  const created = await createPostedJobWithPublishedSpecification({
    title: input.requirement.title,
    status: "OPEN" as JobStatus,
    companyId: input.companyId,
    createdByUserId: input.ownerUserId,
    sourcingDatabaseSource: sourcing.sourcingDatabaseSource,
    sourcingAccessDetails: sourcing.sourcingAccessDetails,
    fields: {
      title: input.requirement.title,
      roleCategory: input.requirement.roleCategory,
      experienceRange: input.requirement.experienceRange,
      location: input.requirement.location,
      compensationRange: input.requirement.compensationRange,
      targetHireDate: input.hireDate,
      numberOfPositions: 4,
      mustHaveRequirements: input.requirement.mustHaveRequirements,
      niceToHaveRequirements: input.requirement.niceToHaveRequirements,
      jobDescription: input.requirement.jobDescription,
      evaluationCriteria: input.requirement.evaluationCriteria,
      primarySkills: input.requirement.primarySkills,
    },
  });

  const now = new Date();
  const accessReceivedAt =
    input.requirement.kind === "sourcing_active" ||
    input.requirement.kind === "sourcing_hired"
      ? now
      : null;

  await prisma.job.update({
    where: { id: created.id },
    data: {
      assignedInterviewerId: input.interviewerId,
      requirementLifecycle: lifecycleFor(input.requirement.kind),
      sourcingAccessReceivedAt: accessReceivedAt,
      shortlistingDueAt: accessReceivedAt
        ? new Date(accessReceivedAt.getTime() + 24 * 60 * 60 * 1000)
        : null,
    },
  });

  return { id: created.id, created: true };
}

async function ensureCandidateApplication(input: {
  companyId: number;
  jobId: number;
  interviewerId: number;
  name: string;
  role: string;
  status: ApplicationPipelineStatus;
  source: SourcingDatabaseSource;
}) {
  const existingCandidate = await prisma.candidate.findFirst({
    where: {
      companyId: input.companyId,
      name: input.name,
    },
    select: { id: true },
  });

  if (existingCandidate) {
    const existingApplication = await prisma.application.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: existingCandidate.id,
          jobId: input.jobId,
        },
      },
      select: { id: true },
    });

    if (existingApplication) {
      return { applicationId: existingApplication.id, created: false };
    }
  }

  const experienceYears = 4 + (input.name.length % 8);
  const location = "Bengaluru";
  const currentEmployer = "Previous Employer";
  const skills = `${input.role}, communication, problem solving`;
  const expectedCTC = "₹28 LPA";
  const expertScore =
    input.status === ApplicationPipelineStatus.CV_POOL ? null : 8;

  const candidate =
    existingCandidate ??
    (await prisma.candidate.create({
      data: {
        name: input.name,
        role: input.role,
        experienceYears,
        status: candidateStatusFor(input.status),
        location,
        currentEmployer,
        skills,
        expectedCTC,
        companyId: input.companyId,
      },
      select: { id: true },
    }));

  if (!existingCandidate) {
    await prisma.candidateProfile.create({
      data: {
        candidateId: candidate.id,
        companyId: input.companyId,
        headline: input.role,
        location,
        experienceYears,
        skillsText: skills,
        currentEmployer,
        expectedCTC,
      },
    });
  }

  const application = await prisma.application.create({
    data: {
      candidateId: candidate.id,
      jobId: input.jobId,
      companyId: input.companyId,
      status: input.status,
      source: input.source,
      expertScore,
      rejectionReason: null,
    },
    select: { id: true },
  });

  if (
    input.status === ApplicationPipelineStatus.TECH_EVALUATION ||
    input.status === ApplicationPipelineStatus.SHORTLISTED ||
    input.status === ApplicationPipelineStatus.SELECTED ||
    input.status === ApplicationPipelineStatus.HIRED
  ) {
    await prisma.evaluation.create({
      data: {
        applicationId: application.id,
        interviewerId: input.interviewerId,
        overallScore: 8,
        recommendation: Recommendation.HIRE,
        fitDecision: EvaluationFitDecision.RIGHT_FIT,
        hireProbability: "High",
        notes: "Fixture evaluation for local testing.",
        evaluatedAt: new Date(),
        scorecard: [
          {
            skill: "Role depth",
            score: 8,
            comment: "Strong evidence of recent delivery.",
          },
        ],
      },
    });
  }

  return { applicationId: application.id, created: true };
}
