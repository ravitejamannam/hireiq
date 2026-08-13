/**
 * Canonical HireIQ V1 QA dataset (through T66).
 *
 * Namespace: V1QA
 * Deterministic, idempotent, safe to rerun.
 * Deletes only known temporary/QA fixtures — never Netflix/DDAI/OpenAi
 * or admin@hireiq.local.
 *
 * Usage:
 *   npx tsx scripts/seed-v1-qa.ts
 *   npx tsx scripts/seed-v1-qa.ts --reset
 *
 * Shared password for all V1QA users is documented in scripts/V1-QA-README.md.
 */
import {
  ApplicationPipelineStatus,
  PrismaClient,
  type EvaluationFitDecision,
  type Recommendation,
} from "@prisma/client";

import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

const NS = "V1QA";
const PASSWORD = "V1QaPass123!";

const EMAILS = {
  admin: "v1qa.admin@hireiq.local",
  clientAlpha: "v1qa.client.alpha@hireiq.local",
  clientBeta: "v1qa.client.beta@hireiq.local",
  interviewerAlpha: "v1qa.interviewer.alpha@hireiq.local",
  interviewerBeta: "v1qa.interviewer.beta@hireiq.local",
} as const;

const OLD_COMPANY_NAMES = [
  "QA Company Alpha",
  "QA Company Beta",
  "T58 Manual Company",
] as const;

const OLD_INTERVIEWER_NAMES = [
  "QA Interviewer Alpha",
  "QA Interviewer Beta",
  "T58 Manual Interviewer",
] as const;

const OLD_USER_EMAILS = [
  "qa.admin@hireiq.local",
  "qa.client.alpha@hireiq.local",
  "qa.client.beta@hireiq.local",
  "qa.interviewer.alpha@hireiq.local",
  "qa.interviewer.beta@hireiq.local",
  "t58.manual.client@example.com",
] as const;

type ScorecardEntry = {
  skill: string;
  score: number;
  comment: string | null;
};

type QuestionSeed = {
  question: string;
  answer: string;
  expertComment: string;
  score: number;
  difficulty: string;
  weight: string;
};

type EvalSeed = {
  overallScore: number;
  recommendation: Recommendation;
  hireProbability: string;
  fitDecision: EvaluationFitDecision;
  notes: string;
  scorecard: ScorecardEntry[];
  questions?: QuestionSeed[];
};

type AppSeed = {
  code: string;
  role: string;
  experienceYears: number;
  location: string;
  currentEmployer: string;
  skills: string;
  expectedCTC: string;
  status: ApplicationPipelineStatus;
  source: "LINKEDIN" | "NAUKRI";
  expertScore?: number;
  rejectionReason?: string;
  evaluation?: EvalSeed;
};

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`V1QA ASSERT FAIL: ${message}`);
  }
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

const requirementBase = {
  roleCategory: "ENGINEERING" as const,
  experienceRange: "4-7 years",
  location: "Bengaluru",
  compensationRange: "28-40 LPA",
  targetHireDate: new Date("2026-11-15T00:00:00.000Z"),
  numberOfPositions: 2,
  mustHaveRequirements: "Strong TypeScript, system design, ownership",
  niceToHaveRequirements: "GraphQL, AWS, mentoring experience",
  jobDescription:
    "Design and ship reliable hiring-platform services with clear APIs and observability.",
  evaluationCriteria:
    "Coding quality, system design clarity, communication, and product sense.",
  primarySkills: "TypeScript, Node.js, PostgreSQL",
};

function backendEval(
  score: number,
  recommendation: Recommendation,
  hireProbability: string,
  fitDecision: EvaluationFitDecision,
  notes: string,
  questions?: QuestionSeed[],
): EvalSeed {
  return {
    overallScore: score,
    recommendation,
    hireProbability,
    fitDecision,
    notes,
    scorecard: [
      {
        skill: "TypeScript",
        score: Math.min(5, Math.max(2, Math.round(score / 20))),
        comment: "Implementation quality",
      },
      {
        skill: "System Design",
        score: Math.min(5, Math.max(2, Math.round((score - 8) / 20))),
        comment: fitDecision === "RIGHT_FIT" ? "Clear trade-offs" : "Gaps in depth",
      },
      {
        skill: "Communication",
        score: Math.min(5, Math.max(2, Math.round((score - 4) / 22))),
        comment: null,
      },
    ],
    questions,
  };
}

const defaultQuestions: QuestionSeed[] = [
  {
    question: "How would you design a job application pipeline?",
    answer: "Explicit state machine with tenant-scoped transitions.",
    expertComment: "Grounded in ownership and integrity.",
    score: 4,
    difficulty: "Medium",
    weight: "High",
  },
  {
    question: "How do you keep billing from firing too early?",
    answer: "Generate billing only after the candidate is hired.",
    expertComment: "Matches HireIQ hire-owned billing.",
    score: 5,
    difficulty: "Medium",
    weight: "High",
  },
];

const requirementAApps: AppSeed[] = [
  {
    code: "001",
    role: "Senior Backend Engineer",
    experienceYears: 6,
    location: "Bengaluru",
    currentEmployer: "Northwind Soft",
    skills: "TypeScript, PostgreSQL, Redis",
    expectedCTC: "36 LPA",
    status: "CV_POOL",
    source: "LINKEDIN",
  },
  {
    code: "002",
    role: "Backend Engineer",
    experienceYears: 5,
    location: "Hyderabad",
    currentEmployer: "Contoso Labs",
    skills: "Node.js, Kafka, SQL",
    expectedCTC: "32 LPA",
    status: "CV_POOL",
    source: "NAUKRI",
  },
  {
    code: "003",
    role: "API Engineer",
    experienceYears: 4,
    location: "Pune",
    currentEmployer: "Fabrikam Cloud",
    skills: "NestJS, PostgreSQL, AWS",
    expectedCTC: "30 LPA",
    status: "CV_POOL",
    source: "LINKEDIN",
  },
  {
    code: "004",
    role: "Platform Engineer",
    experienceYears: 7,
    location: "Chennai",
    currentEmployer: "Litware Systems",
    skills: "Go, Kubernetes, gRPC",
    expectedCTC: "38 LPA",
    status: "CV_POOL",
    source: "NAUKRI",
  },
  {
    code: "005",
    role: "Senior Backend Engineer",
    experienceYears: 8,
    location: "Bengaluru",
    currentEmployer: "Adventure Works",
    skills: "TypeScript, System Design, AWS",
    expectedCTC: "42 LPA",
    status: "EXPERT_REVIEW",
    source: "LINKEDIN",
    expertScore: 7,
    evaluation: backendEval(72, "HIRE", "Medium", "RIGHT_FIT", `${NS} expert review notes 005`),
  },
  {
    code: "006",
    role: "Backend Engineer",
    experienceYears: 6,
    location: "Hyderabad",
    currentEmployer: "Relecloud",
    skills: "Java, Spring, Kafka",
    expectedCTC: "34 LPA",
    status: "TECH_EVALUATION",
    source: "LINKEDIN",
    expertScore: 8,
    evaluation: backendEval(
      81,
      "HIRE",
      "High",
      "RIGHT_FIT",
      `${NS} technical evaluation notes 006`,
      defaultQuestions,
    ),
  },
  {
    code: "007",
    role: "Backend Engineer",
    experienceYears: 3,
    location: "Pune",
    currentEmployer: "Tailspin Toys",
    skills: "JavaScript, MongoDB",
    expectedCTC: "24 LPA",
    status: "REJECTED",
    source: "NAUKRI",
    expertScore: 4,
    rejectionReason: "Insufficient backend depth for the requirement.",
  },
  {
    code: "008",
    role: "Backend Engineer",
    experienceYears: 5,
    location: "Remote",
    currentEmployer: "Wide World Importers",
    skills: "PHP, MySQL",
    expectedCTC: "28 LPA",
    status: "REJECTED",
    source: "LINKEDIN",
    expertScore: 5,
    rejectionReason: "Stack mismatch.",
  },
];

const requirementBApps: AppSeed[] = [
  {
    code: "009",
    role: "Data Engineer",
    experienceYears: 5,
    location: "Hyderabad",
    currentEmployer: "Blue Yonder",
    skills: "Python, Spark, SQL",
    expectedCTC: "34 LPA",
    status: "EXPERT_REVIEW",
    source: "LINKEDIN",
    expertScore: 8,
    evaluation: backendEval(81, "HIRE", "High", "RIGHT_FIT", `${NS} expert review notes 009`),
  },
  {
    code: "010",
    role: "Data Engineer",
    experienceYears: 4,
    location: "Bengaluru",
    currentEmployer: "Woodgrove Bank",
    skills: "dbt, Snowflake, Airflow",
    expectedCTC: "31 LPA",
    status: "EXPERT_REVIEW",
    source: "NAUKRI",
    expertScore: 6,
    evaluation: backendEval(72, "NO_HIRE", "Low", "NOT_FIT", `${NS} expert review notes 010`),
  },
];

const requirementCApps: AppSeed[] = [
  {
    code: "011",
    role: "ML Engineer",
    experienceYears: 6,
    location: "Bengaluru",
    currentEmployer: "Northwind Soft",
    skills: "Python, PyTorch, MLOps",
    expectedCTC: "40 LPA",
    status: "TECH_EVALUATION",
    source: "LINKEDIN",
    expertScore: 9,
    evaluation: backendEval(
      87,
      "STRONG_HIRE",
      "High",
      "RIGHT_FIT",
      `${NS} technical evaluation notes 011`,
      defaultQuestions,
    ),
  },
  {
    code: "012",
    role: "ML Engineer",
    experienceYears: 5,
    location: "Pune",
    currentEmployer: "Contoso Labs",
    skills: "Python, scikit-learn, SQL",
    expectedCTC: "35 LPA",
    status: "TECH_EVALUATION",
    source: "NAUKRI",
    expertScore: 7,
    evaluation: backendEval(81, "HIRE", "Medium", "RIGHT_FIT", `${NS} technical evaluation notes 012`),
  },
];

const requirementDApps: AppSeed[] = [
  {
    code: "013",
    role: "Full Stack Engineer",
    experienceYears: 6,
    location: "Bengaluru",
    currentEmployer: "Fabrikam Cloud",
    skills: "React, TypeScript, Node.js",
    expectedCTC: "38 LPA",
    status: "SHORTLISTED",
    source: "LINKEDIN",
    expertScore: 9,
    evaluation: backendEval(
      87,
      "HIRE",
      "High",
      "RIGHT_FIT",
      `${NS} shortlist evaluation 013`,
      defaultQuestions,
    ),
  },
  {
    code: "014",
    role: "Full Stack Engineer",
    experienceYears: 5,
    location: "Hyderabad",
    currentEmployer: "Litware Systems",
    skills: "Next.js, PostgreSQL, GraphQL",
    expectedCTC: "34 LPA",
    status: "SHORTLISTED",
    source: "NAUKRI",
    expertScore: 8,
    evaluation: backendEval(
      81,
      "HIRE",
      "Medium",
      "RIGHT_FIT",
      `${NS} shortlist evaluation 014`,
      defaultQuestions,
    ),
  },
  {
    code: "015",
    role: "Full Stack Engineer",
    experienceYears: 7,
    location: "Chennai",
    currentEmployer: "Adventure Works",
    skills: "React, Node.js, AWS",
    expectedCTC: "41 LPA",
    status: "SELECTED",
    source: "LINKEDIN",
    expertScore: 9,
    evaluation: backendEval(
      93,
      "STRONG_HIRE",
      "High",
      "RIGHT_FIT",
      `${NS} selected evaluation 015 — billing must not exist`,
      defaultQuestions,
    ),
  },
];

const requirementEApps: AppSeed[] = [
  {
    code: "016",
    role: "Staff Software Engineer",
    experienceYears: 9,
    location: "Bengaluru",
    currentEmployer: "Relecloud",
    skills: "TypeScript, Distributed Systems, PostgreSQL",
    expectedCTC: "48 LPA",
    status: "SHORTLISTED",
    source: "LINKEDIN",
    expertScore: 8,
    evaluation: backendEval(
      81,
      "HIRE",
      "High",
      "RIGHT_FIT",
      `${NS} shortlist evaluation 016 — client can Select`,
      defaultQuestions,
    ),
  },
  {
    code: "017",
    role: "Staff Software Engineer",
    experienceYears: 10,
    location: "Hyderabad",
    currentEmployer: "Blue Yonder",
    skills: "Go, Kubernetes, System Design",
    expectedCTC: "52 LPA",
    status: "SELECTED",
    source: "LINKEDIN",
    expertScore: 9,
    evaluation: backendEval(
      87,
      "STRONG_HIRE",
      "High",
      "RIGHT_FIT",
      `${NS} selected evaluation 017 — client can Confirm Hire, no billing`,
      defaultQuestions,
    ),
  },
  {
    code: "018",
    role: "Staff Software Engineer",
    experienceYears: 11,
    location: "Bengaluru",
    currentEmployer: "Woodgrove Bank",
    skills: "TypeScript, Architecture, Mentoring",
    expectedCTC: "55 LPA",
    status: "HIRED",
    source: "LINKEDIN",
    expertScore: 9,
    evaluation: backendEval(
      93,
      "STRONG_HIRE",
      "High",
      "RIGHT_FIT",
      `${NS} hired evaluation 018 — billing generated`,
      defaultQuestions,
    ),
  },
];

const requirementFApps: AppSeed[] = [
  {
    code: "019",
    role: "Backend Engineer",
    experienceYears: 6,
    location: "Mumbai",
    currentEmployer: "Northwind Soft",
    skills: "TypeScript, PostgreSQL, Redis",
    expectedCTC: "36 LPA",
    status: "CV_POOL",
    source: "LINKEDIN",
  },
  {
    code: "020",
    role: "Backend Engineer",
    experienceYears: 5,
    location: "Mumbai",
    currentEmployer: "Contoso Labs",
    skills: "Java, Spring, Kafka",
    expectedCTC: "33 LPA",
    status: "TECH_EVALUATION",
    source: "NAUKRI",
    expertScore: 7,
    evaluation: backendEval(
      74,
      "NO_HIRE",
      "Low",
      "NOT_FIT",
      `${NS} Beta technical evaluation 020`,
      [
        {
          question: "How do you enforce tenant isolation?",
          answer: "Scope every query by companyId from the session.",
          expertComment: "Correct for IDOR fixtures.",
          score: 4,
          difficulty: "Medium",
          weight: "High",
        },
      ],
    ),
  },
  {
    code: "021",
    role: "Backend Engineer",
    experienceYears: 7,
    location: "Pune",
    currentEmployer: "Fabrikam Cloud",
    skills: "Go, PostgreSQL, gRPC",
    expectedCTC: "39 LPA",
    status: "SHORTLISTED",
    source: "LINKEDIN",
    expertScore: 8,
    evaluation: backendEval(
      81,
      "HIRE",
      "Medium",
      "RIGHT_FIT",
      `${NS} Beta shortlist evaluation 021`,
      defaultQuestions,
    ),
  },
];

type FixtureSet = {
  companyIds: number[];
  interviewerIds: number[];
  userIds: number[];
  jobIds: number[];
  candidateIds: number[];
};

async function collectOldTemporaryFixtures(): Promise<FixtureSet> {
  const companies = await prisma.company.findMany({
    where: { name: { in: [...OLD_COMPANY_NAMES] } },
    select: { id: true, name: true },
  });
  const interviewers = await prisma.interviewer.findMany({
    where: { name: { in: [...OLD_INTERVIEWER_NAMES] } },
    select: { id: true, name: true },
  });
  const users = await prisma.user.findMany({
    where: { email: { in: [...OLD_USER_EMAILS] } },
    select: { id: true, email: true },
  });
  const jobs = await prisma.job.findMany({
    where: {
      OR: [
        { companyId: { in: companies.map((company) => company.id) } },
        { title: { startsWith: "TMP-T" } },
        { title: { startsWith: "T58 Manual" } },
      ],
    },
    select: { id: true },
  });
  const candidates = await prisma.candidate.findMany({
    where: {
      OR: [
        { companyId: { in: companies.map((company) => company.id) } },
        { name: { startsWith: "QA -" } },
        { name: { startsWith: "TMP-T" } },
        { name: { startsWith: "T58 Manual" } },
      ],
    },
    select: { id: true },
  });

  return {
    companyIds: companies.map((company) => company.id),
    interviewerIds: interviewers.map((interviewer) => interviewer.id),
    userIds: users.map((user) => user.id),
    jobIds: jobs.map((job) => job.id),
    candidateIds: candidates.map((candidate) => candidate.id),
  };
}

async function collectV1QaFixtures(): Promise<FixtureSet> {
  const companies = await prisma.company.findMany({
    where: { name: { startsWith: NS } },
    select: { id: true },
  });
  const interviewers = await prisma.interviewer.findMany({
    where: { name: { startsWith: NS } },
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: "v1qa." } },
        { name: { startsWith: NS } },
      ],
    },
    select: { id: true },
  });
  const jobs = await prisma.job.findMany({
    where: {
      OR: [
        { title: { startsWith: NS } },
        { companyId: { in: companies.map((company) => company.id) } },
      ],
    },
    select: { id: true },
  });
  const candidates = await prisma.candidate.findMany({
    where: {
      OR: [
        { name: { startsWith: NS } },
        { companyId: { in: companies.map((company) => company.id) } },
      ],
    },
    select: { id: true },
  });

  return {
    companyIds: companies.map((company) => company.id),
    interviewerIds: interviewers.map((interviewer) => interviewer.id),
    userIds: users.map((user) => user.id),
    jobIds: jobs.map((job) => job.id),
    candidateIds: candidates.map((candidate) => candidate.id),
  };
}

async function deleteFixtureSet(set: FixtureSet) {
  const companyIds = unique(set.companyIds);
  const interviewerIds = unique(set.interviewerIds);
  const userIds = unique(set.userIds);
  const jobIds = unique(set.jobIds);
  const candidateIds = unique(set.candidateIds);

  if (
    companyIds.length === 0 &&
    interviewerIds.length === 0 &&
    userIds.length === 0 &&
    jobIds.length === 0 &&
    candidateIds.length === 0
  ) {
    return;
  }

  const applicationOr: Array<
    | { jobId: { in: number[] } }
    | { candidateId: { in: number[] } }
    | { companyId: { in: number[] } }
  > = [];
  if (jobIds.length) applicationOr.push({ jobId: { in: jobIds } });
  if (candidateIds.length) applicationOr.push({ candidateId: { in: candidateIds } });
  if (companyIds.length) applicationOr.push({ companyId: { in: companyIds } });

  const applications = applicationOr.length
    ? await prisma.application.findMany({
        where: { OR: applicationOr },
        select: { id: true },
      })
    : [];
  const applicationIds = applications.map((application) => application.id);

  if (applicationIds.length) {
    const evaluations = await prisma.evaluation.findMany({
      where: { applicationId: { in: applicationIds } },
      select: { id: true },
    });
    const evaluationIds = evaluations.map((evaluation) => evaluation.id);

    if (evaluationIds.length) {
      await prisma.evaluationQuestion.deleteMany({
        where: { evaluationId: { in: evaluationIds } },
      });
    }

    await prisma.evaluation.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
    await prisma.interview.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
    await prisma.codingTest.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
    await prisma.report.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
    await prisma.billingLineItem.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
  }

  const billingOr: Array<
    { jobId: { in: number[] } } | { companyId: { in: number[] } }
  > = [];
  if (jobIds.length) billingOr.push({ jobId: { in: jobIds } });
  if (companyIds.length) billingOr.push({ companyId: { in: companyIds } });
  if (billingOr.length) {
    await prisma.billingRecord.deleteMany({ where: { OR: billingOr } });
  }

  const notificationOr: Array<
    { jobId: { in: number[] } } | { interviewerId: { in: number[] } }
  > = [];
  if (jobIds.length) notificationOr.push({ jobId: { in: jobIds } });
  if (interviewerIds.length) {
    notificationOr.push({ interviewerId: { in: interviewerIds } });
  }
  if (notificationOr.length) {
    await prisma.notification.deleteMany({ where: { OR: notificationOr } });
  }

  if (applicationIds.length) {
    await prisma.application.deleteMany({
      where: { id: { in: applicationIds } },
    });
  }

  const candidateOr: Array<{ id: { in: number[] } } | { companyId: { in: number[] } }> =
    [];
  if (candidateIds.length) candidateOr.push({ id: { in: candidateIds } });
  if (companyIds.length) candidateOr.push({ companyId: { in: companyIds } });
  if (candidateOr.length) {
    await prisma.candidate.deleteMany({ where: { OR: candidateOr } });
  }

  const jobOr: Array<{ id: { in: number[] } } | { companyId: { in: number[] } }> =
    [];
  if (jobIds.length) jobOr.push({ id: { in: jobIds } });
  if (companyIds.length) jobOr.push({ companyId: { in: companyIds } });
  if (jobOr.length) {
    await prisma.job.deleteMany({ where: { OR: jobOr } });
  }

  if (userIds.length) {
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }

  if (interviewerIds.length) {
    await prisma.interviewer.deleteMany({
      where: { id: { in: interviewerIds } },
    });
  }

  if (companyIds.length) {
    await prisma.company.deleteMany({
      where: { id: { in: companyIds } },
    });
  }
}

async function seedApplications(params: {
  apps: AppSeed[];
  jobId: number;
  companyId: number;
  interviewerId: number;
}) {
  const created: Array<{
    code: string;
    applicationId: number;
    candidateId: number;
    status: ApplicationPipelineStatus;
  }> = [];

  for (const seed of params.apps) {
    const candidate = await prisma.candidate.create({
      data: {
        name: `${NS} Candidate ${seed.code}`,
        role: seed.role,
        experienceYears: seed.experienceYears,
        status: seed.status === "HIRED" ? "HIRED" : "APPLIED",
        location: seed.location,
        currentEmployer: seed.currentEmployer,
        skills: seed.skills,
        expectedCTC: seed.expectedCTC,
        companyId: params.companyId,
      },
    });

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: params.jobId,
        companyId: params.companyId,
        status: seed.status,
        source: seed.source,
        expertScore: seed.expertScore ?? null,
        rejectionReason: seed.rejectionReason ?? null,
      },
    });

    if (seed.evaluation) {
      const evaluation = await prisma.evaluation.create({
        data: {
          applicationId: application.id,
          interviewerId: params.interviewerId,
          overallScore: seed.evaluation.overallScore,
          scorecard: seed.evaluation.scorecard,
          notes: seed.evaluation.notes,
          recordingUrl: `https://example.com/v1qa-${seed.code}`,
          recommendation: seed.evaluation.recommendation,
          hireProbability: seed.evaluation.hireProbability,
          fitDecision: seed.evaluation.fitDecision,
          evaluatedAt: hoursFromNow(-48),
        },
      });

      if (seed.evaluation.questions?.length) {
        await prisma.evaluationQuestion.createMany({
          data: seed.evaluation.questions.map((question) => ({
            evaluationId: evaluation.id,
            ...question,
          })),
        });
      }
    }

    created.push({
      code: seed.code,
      applicationId: application.id,
      candidateId: candidate.id,
      status: seed.status,
    });
  }

  return created;
}

async function assertV1QaIntegrity() {
  const companies = await prisma.company.findMany({
    where: { name: { startsWith: NS } },
    select: { id: true, name: true },
  });
  const alpha = companies.find((company) => company.name === `${NS} Company Alpha`);
  const beta = companies.find((company) => company.name === `${NS} Company Beta`);
  assert(alpha && beta, "Alpha and Beta companies exist");

  const applications = await prisma.application.findMany({
    where: { candidate: { name: { startsWith: `${NS} Candidate` } } },
    include: {
      candidate: { select: { companyId: true } },
      job: {
        select: {
          companyId: true,
          assignedInterviewerId: true,
          requirementLifecycle: true,
          title: true,
        },
      },
      billingLineItem: true,
      evaluations: {
        select: { interviewerId: true, applicationId: true },
      },
    },
  });

  assert(applications.length >= 19, `expected >= 19 applications, got ${applications.length}`);

  for (const application of applications) {
    assert(
      application.candidate.companyId === application.job.companyId &&
        application.companyId === application.job.companyId,
      `T64 company mismatch on application ${application.id}`,
    );
  }

  const selected = applications.filter((application) => application.status === "SELECTED");
  assert(selected.length >= 2, "at least two SELECTED applications");
  for (const application of selected) {
    assert(!application.billingLineItem, `SELECTED application ${application.id} has billing`);
  }

  const hired = applications.filter((application) => application.status === "HIRED");
  assert(hired.length === 1, `expected 1 HIRED application, got ${hired.length}`);
  for (const application of hired) {
    assert(application.billingLineItem, `HIRED application ${application.id} missing line item`);
  }

  const lineItems = await prisma.billingLineItem.findMany({
    where: {
      billingRecord: { company: { name: { startsWith: NS } } },
    },
    include: { application: { select: { status: true, jobId: true } } },
  });
  assert(lineItems.length === hired.length, "line item count matches HIRED count");
  for (const item of lineItems) {
    assert(item.application.status === "HIRED", "line item must point at HIRED application");
  }

  const jobs = await prisma.job.findMany({
    where: { title: { startsWith: NS } },
    include: {
      applications: { select: { status: true } },
      billingRecords: true,
    },
  });
  for (const job of jobs) {
    const hasHired = job.applications.some((application) => application.status === "HIRED");
    const hasSelected = job.applications.some((application) => application.status === "SELECTED");
    if (hasSelected && !hasHired) {
      assert(
        job.billingRecords.length === 0,
        `billing exists on selected-only job ${job.title}`,
      );
    }
    if (job.requirementLifecycle === "BILLING_GENERATED") {
      assert(hasHired, `BILLING_GENERATED without HIRED on ${job.title}`);
    }
    if (hasHired) {
      assert(
        job.requirementLifecycle === "BILLING_GENERATED",
        `HIRED job ${job.title} is not BILLING_GENERATED`,
      );
    }
  }

  for (const application of applications) {
    for (const evaluation of application.evaluations) {
      assert(
        evaluation.interviewerId === application.job.assignedInterviewerId,
        `evaluation interviewer mismatch on application ${application.id}`,
      );
    }
  }

  const evaluationPairs = applications.flatMap((application) =>
    application.evaluations.map((evaluation) => `${evaluation.applicationId}:${evaluation.interviewerId}`),
  );
  assert(
    evaluationPairs.length === unique(evaluationPairs).length,
    "evaluation uniqueness violated",
  );

  const notifications = await prisma.notification.findMany({
    where: {
      job: { title: { startsWith: NS } },
    },
    select: { jobId: true, interviewerId: true, type: true },
  });
  const notificationKeys = notifications.map(
    (notification) => `${notification.jobId}:${notification.interviewerId}:${notification.type}`,
  );
  assert(
    notificationKeys.length === unique(notificationKeys).length,
    "notification uniqueness violated",
  );
  assert(notifications.length >= 2, "expected interviewer notifications");

  const alphaIds = new Set(
    (
      await prisma.job.findMany({
        where: { companyId: alpha.id },
        select: { id: true },
      })
    ).map((job) => job.id),
  );
  const betaIds = new Set(
    (
      await prisma.job.findMany({
        where: { companyId: beta.id },
        select: { id: true },
      })
    ).map((job) => job.id),
  );

  for (const application of applications) {
    if (application.companyId === alpha.id) {
      assert(!betaIds.has(application.jobId), "Alpha application references Beta job");
      assert(application.candidate.companyId === alpha.id, "Alpha candidate company mismatch");
    }
    if (application.companyId === beta.id) {
      assert(!alphaIds.has(application.jobId), "Beta application references Alpha job");
      assert(application.candidate.companyId === beta.id, "Beta candidate company mismatch");
    }
  }

  const billing = await prisma.billingRecord.findMany({
    where: { company: { name: { startsWith: NS } } },
    include: { lineItems: true },
  });
  assert(billing.length === 1, `expected 1 V1QA billing record, got ${billing.length}`);
  assert(billing[0]?.companyId === alpha.id, "billing belongs to Alpha");
  assert(billing[0]?.lineItems.length === 1, "billing has one hired line item");

  const counts = applications.reduce<Record<string, number>>((acc, application) => {
    acc[application.status] = (acc[application.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    companies: companies.length,
    applications: applications.length,
    hired: hired.length,
    selected: selected.length,
    billing: billing.length,
    notifications: notifications.length,
    counts,
  };
}

async function seedV1Qa() {
  const passwordHash = await hashPassword(PASSWORD);

  const companyAlpha = await prisma.company.create({
    data: {
      name: `${NS} Company Alpha`,
      industry: "Software",
      employees: 150,
    },
  });
  const companyBeta = await prisma.company.create({
    data: {
      name: `${NS} Company Beta`,
      industry: "Fintech",
      employees: 90,
    },
  });

  const interviewerAlpha = await prisma.interviewer.create({
    data: {
      name: `${NS} Interviewer Alpha`,
      category: "ENGINEERING",
      availability: "AVAILABLE",
    },
  });
  const interviewerBeta = await prisma.interviewer.create({
    data: {
      name: `${NS} Interviewer Beta`,
      category: "ENGINEERING",
      availability: "AVAILABLE",
    },
  });

  await prisma.user.create({
    data: {
      email: EMAILS.admin,
      name: `${NS} Admin`,
      role: "ADMIN",
      passwordHash,
    },
  });
  await prisma.user.create({
    data: {
      email: EMAILS.clientAlpha,
      name: `${NS} Client Alpha`,
      role: "CLIENT",
      passwordHash,
      companyId: companyAlpha.id,
    },
  });
  await prisma.user.create({
    data: {
      email: EMAILS.clientBeta,
      name: `${NS} Client Beta`,
      role: "CLIENT",
      passwordHash,
      companyId: companyBeta.id,
    },
  });
  await prisma.user.create({
    data: {
      email: EMAILS.interviewerAlpha,
      name: `${NS} Interviewer Alpha User`,
      role: "INTERVIEWER",
      passwordHash,
      interviewerId: interviewerAlpha.id,
    },
  });
  await prisma.user.create({
    data: {
      email: EMAILS.interviewerBeta,
      name: `${NS} Interviewer Beta User`,
      role: "INTERVIEWER",
      passwordHash,
      interviewerId: interviewerBeta.id,
    },
  });

  const jobA = await prisma.job.create({
    data: {
      title: `${NS} Senior Backend Engineer`,
      status: "OPEN",
      companyId: companyAlpha.id,
      assignedInterviewerId: interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      clientCompletedAt: hoursFromNow(-72),
      sourcingDatabaseSource: "LINKEDIN",
      sourcingAccessDetails: `${NS} LinkedIn seat ready`,
      sourcingAccessReceivedAt: hoursFromNow(-4),
      shortlistingDueAt: hoursFromNow(20),
      ...requirementBase,
      jobDescription: `${NS} full end-to-end backend requirement.`,
    },
  });

  const jobB = await prisma.job.create({
    data: {
      title: `${NS} Data Engineer`,
      status: "OPEN",
      companyId: companyAlpha.id,
      assignedInterviewerId: interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      clientCompletedAt: hoursFromNow(-60),
      sourcingDatabaseSource: "NAUKRI",
      sourcingAccessDetails: `${NS} Naukri seat ready`,
      ...requirementBase,
      primarySkills: "Python, Spark, SQL",
      experienceRange: "3-6 years",
      location: "Hyderabad",
      compensationRange: "26-36 LPA",
      jobDescription: `${NS} expert-review data engineering requirement.`,
    },
  });

  const jobC = await prisma.job.create({
    data: {
      title: `${NS} ML Engineer`,
      status: "OPEN",
      companyId: companyAlpha.id,
      assignedInterviewerId: interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      clientCompletedAt: hoursFromNow(-80),
      sourcingDatabaseSource: "LINKEDIN",
      sourcingAccessDetails: `${NS} LinkedIn seat ready`,
      sourcingAccessReceivedAt: hoursFromNow(-32),
      shortlistingDueAt: hoursFromNow(-8),
      ...requirementBase,
      primarySkills: "Python, PyTorch, MLOps",
      location: "Bengaluru",
      compensationRange: "32-45 LPA",
      jobDescription: `${NS} technical-evaluation ML requirement. SLA overdue.`,
    },
  });

  const jobD = await prisma.job.create({
    data: {
      title: `${NS} Full Stack Engineer`,
      status: "OPEN",
      companyId: companyAlpha.id,
      assignedInterviewerId: interviewerAlpha.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      clientCompletedAt: hoursFromNow(-50),
      sourcingDatabaseSource: "LINKEDIN",
      sourcingAccessDetails: `${NS} LinkedIn seat ready`,
      sourcingAccessReceivedAt: hoursFromNow(-22),
      shortlistingDueAt: hoursFromNow(2),
      ...requirementBase,
      primarySkills: "React, TypeScript, Node.js",
      jobDescription: `${NS} client-decision full stack requirement. SLA approaching.`,
    },
  });

  const jobE = await prisma.job.create({
    data: {
      title: `${NS} Staff Software Engineer`,
      status: "OPEN",
      companyId: companyAlpha.id,
      assignedInterviewerId: interviewerAlpha.id,
      requirementLifecycle: "BILLING_GENERATED",
      clientCompletedAt: hoursFromNow(-120),
      sourcingDatabaseSource: "LINKEDIN",
      sourcingAccessDetails: `${NS} LinkedIn seat ready`,
      sourcingAccessReceivedAt: hoursFromNow(-72),
      shortlistingDueAt: hoursFromNow(-48),
      shortlistingCompletedAt: hoursFromNow(-40),
      ...requirementBase,
      experienceRange: "8-12 years",
      compensationRange: "45-60 LPA",
      primarySkills: "TypeScript, Architecture, Leadership",
      jobDescription: `${NS} hired staff requirement with generated billing.`,
    },
  });

  const jobF = await prisma.job.create({
    data: {
      title: `${NS} Company Beta Backend Engineer`,
      status: "OPEN",
      companyId: companyBeta.id,
      assignedInterviewerId: interviewerBeta.id,
      requirementLifecycle: "SOURCING_SHORTLISTING",
      clientCompletedAt: hoursFromNow(-40),
      sourcingDatabaseSource: "LINKEDIN",
      sourcingAccessDetails: `${NS} Beta LinkedIn seat ready`,
      sourcingAccessReceivedAt: hoursFromNow(-6),
      shortlistingDueAt: hoursFromNow(18),
      ...requirementBase,
      location: "Mumbai",
      compensationRange: "30-42 LPA",
      jobDescription: `${NS} Beta tenant-isolation backend requirement.`,
    },
  });

  const createdA = await seedApplications({
    apps: requirementAApps,
    jobId: jobA.id,
    companyId: companyAlpha.id,
    interviewerId: interviewerAlpha.id,
  });
  const createdB = await seedApplications({
    apps: requirementBApps,
    jobId: jobB.id,
    companyId: companyAlpha.id,
    interviewerId: interviewerAlpha.id,
  });
  const createdC = await seedApplications({
    apps: requirementCApps,
    jobId: jobC.id,
    companyId: companyAlpha.id,
    interviewerId: interviewerAlpha.id,
  });
  const createdD = await seedApplications({
    apps: requirementDApps,
    jobId: jobD.id,
    companyId: companyAlpha.id,
    interviewerId: interviewerAlpha.id,
  });
  const createdE = await seedApplications({
    apps: requirementEApps,
    jobId: jobE.id,
    companyId: companyAlpha.id,
    interviewerId: interviewerAlpha.id,
  });
  const createdF = await seedApplications({
    apps: requirementFApps,
    jobId: jobF.id,
    companyId: companyBeta.id,
    interviewerId: interviewerBeta.id,
  });

  const hired = createdE.find((row) => row.status === "HIRED");
  assert(hired, "Requirement E hired application exists");

  const billingRecord = await prisma.billingRecord.create({
    data: {
      jobId: jobE.id,
      companyId: companyAlpha.id,
      status: "PENDING",
    },
  });
  await prisma.billingLineItem.create({
    data: {
      billingRecordId: billingRecord.id,
      applicationId: hired.applicationId,
    },
  });

  await prisma.notification.create({
    data: {
      type: "INTERVIEWER_REQUIREMENT_READY",
      message: `${NS}: Requirement "${jobA.title}" is ready for interviewer review.`,
      jobId: jobA.id,
      interviewerId: interviewerAlpha.id,
    },
  });
  await prisma.notification.create({
    data: {
      type: "INTERVIEWER_REQUIREMENT_READY",
      message: `${NS}: Requirement "${jobF.title}" is ready for interviewer review.`,
      jobId: jobF.id,
      interviewerId: interviewerBeta.id,
    },
  });

  return {
    jobs: { jobA, jobB, jobC, jobD, jobE, jobF },
    created: { createdA, createdB, createdC, createdD, createdE, createdF },
    hired,
    billingRecord,
  };
}

async function main() {
  const resetOnly = process.argv.includes("--reset");

  if (!resetOnly) {
    const old = await collectOldTemporaryFixtures();
    console.log(
      `Cleaning old temporary QA fixtures: companies=${old.companyIds.length} jobs=${old.jobIds.length} candidates=${old.candidateIds.length} users=${old.userIds.length}`,
    );
    await deleteFixtureSet(old);
  }

  const existingV1 = await collectV1QaFixtures();
  console.log(
    `Cleaning V1QA fixtures: companies=${existingV1.companyIds.length} jobs=${existingV1.jobIds.length} candidates=${existingV1.candidateIds.length} users=${existingV1.userIds.length}`,
  );
  await deleteFixtureSet(existingV1);

  if (resetOnly) {
    const remaining = await collectV1QaFixtures();
    assert(remaining.companyIds.length === 0, "V1QA companies remain after reset");
    assert(remaining.userIds.length === 0, "V1QA users remain after reset");
    console.log("V1QA reset complete. No V1QA fixtures remain.");
    return;
  }

  const seeded = await seedV1Qa();
  const summary = await assertV1QaIntegrity();

  console.log("\n==================================================");
  console.log("HireIQ V1QA dataset seeded");
  console.log("See scripts/V1-QA-README.md for login and scenarios");
  console.log("==================================================\n");
  console.log("USERS:");
  console.log(`  ADMIN              ${EMAILS.admin}`);
  console.log(`  CLIENT ALPHA       ${EMAILS.clientAlpha}`);
  console.log(`  CLIENT BETA        ${EMAILS.clientBeta}`);
  console.log(`  INTERVIEWER ALPHA  ${EMAILS.interviewerAlpha}`);
  console.log(`  INTERVIEWER BETA   ${EMAILS.interviewerBeta}`);
  console.log(`  PASSWORD           ${PASSWORD}`);
  console.log("\nREQUIREMENTS:");
  console.log(`  A ${seeded.jobs.jobA.title} id=${seeded.jobs.jobA.id}`);
  console.log(`  B ${seeded.jobs.jobB.title} id=${seeded.jobs.jobB.id}`);
  console.log(`  C ${seeded.jobs.jobC.title} id=${seeded.jobs.jobC.id}`);
  console.log(`  D ${seeded.jobs.jobD.title} id=${seeded.jobs.jobD.id}`);
  console.log(`  E ${seeded.jobs.jobE.title} id=${seeded.jobs.jobE.id}`);
  console.log(`  F ${seeded.jobs.jobF.title} id=${seeded.jobs.jobF.id}`);
  console.log("\nCOUNTS:", summary.counts);
  console.log(
    `HIRED application id=${seeded.hired.applicationId} billingRecord id=${seeded.billingRecord.id}`,
  );
  console.log("V1QA assertions passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
