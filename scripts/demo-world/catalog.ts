/**
 * Client-demo catalog: companies, interviewers, role templates, pipeline pack.
 * Data only — seed-demo-world.ts owns persistence and service calls.
 */

export type InterviewerCategory = "ENGINEERING" | "DATA_SCIENCE" | "PRODUCT" | "DESIGN";
export type RoleCategory = "ENGINEERING" | "SALES" | "DESIGN" | "FINANCE";
export type InterviewRound = "PHONE_SCREEN" | "TECHNICAL" | "SYSTEM_DESIGN" | "HR";
export type PipelineStatus =
  | "CV_POOL"
  | "EXPERT_REVIEW"
  | "TECH_EVALUATION"
  | "SHORTLISTED"
  | "SELECTED"
  | "REJECTED"
  | "HIRED";
export type IngestionChannel = "HOSTED_APPLY" | "REFERRAL" | "MANUAL";

export type CompanyDef = {
  slug: string;
  name: string;
  industry: string;
  employees: number;
  city: string;
  about: string;
  publishApplicationCount: boolean;
  agencyMarkupBps: number | null;
};

export type InterviewerDef = {
  email: string;
  name: string;
  category: InterviewerCategory;
  headline: string;
  location: string;
  aboutText: string;
  roleTitle: string;
  experienceYears: number;
  domains: string[];
  currentTitle: string;
  currentCompany: string;
  priorTitle: string;
  priorCompany: string;
  school: string;
  degree: string;
  field: string;
};

export type RoleSpec = {
  key: string;
  title: string;
  roleCategory: RoleCategory;
  experienceRange: string;
  location: string;
  compensationRange: string;
  primarySkills: string;
  mustHaveRequirements: string;
  niceToHaveRequirements: string;
  jobDescription: string;
  evaluationCriteria: string;
  interviewRoundPlan: InterviewRound[];
  numberOfPositions: number;
  employmentType: "FULL_TIME" | "CONTRACT";
  seniorityLevel: "JUNIOR" | "INTERMEDIATE" | "SENIOR" | "STAFF";
  responsibilities: string[];
  benefits: string[];
  aboutCompany: string;
};

export type PipelineSeat = {
  key: string;
  status: PipelineStatus;
  scoreFraction: number | null;
  interviews: InterviewRound[];
  interviewResult: "PENDING" | "PASSED" | "FAILED" | null;
  offer: "none" | "minted" | "accepted" | "declined";
  bill: boolean;
  source: IngestionChannel;
};

export const DEMO_COMPANIES: CompanyDef[] = [
  {
    slug: "nimbus",
    name: "Nimbus Labs",
    industry: "Technology",
    employees: 120,
    city: "Bengaluru",
    about:
      "Nimbus Labs is a 120-person technology company building hiring infrastructure. The team cares about evidence over résumé theatre: every applicant takes the same assessment and is reviewed by an independent expert before a human decision.",
    publishApplicationCount: true,
    agencyMarkupBps: 1000,
  },
  {
    slug: "harbor",
    name: "Harbor Pay",
    industry: "Fintech",
    employees: 85,
    city: "Mumbai",
    about:
      "Harbor Pay builds settlement rails for mid-market Indian businesses. The product bar is operational correctness: money movement that finance teams can reconcile without a war room.",
    publishApplicationCount: true,
    agencyMarkupBps: 1500,
  },
  {
    slug: "kite",
    name: "Kite Retail",
    industry: "Consumer",
    employees: 240,
    city: "Gurugram",
    about:
      "Kite Retail runs a multi-brand storefront for urban India. Merchandising, last-mile, and a small platform team sit in one operating rhythm.",
    publishApplicationCount: true,
    agencyMarkupBps: 1000,
  },
  {
    slug: "northwind",
    name: "Northwind Health",
    industry: "Healthcare",
    employees: 410,
    city: "Hyderabad",
    about:
      "Northwind Health operates clinic software and care-ops tooling. Reliability and audit trails matter more than launch theatre.",
    publishApplicationCount: false,
    agencyMarkupBps: 1200,
  },
  {
    slug: "cedar",
    name: "Cedar Climate",
    industry: "Climate",
    employees: 64,
    city: "Pune",
    about:
      "Cedar Climate measures and reports industrial emissions for manufacturers who need numbers a CFO will sign. A 64-person team, mostly Pune with a Berlin research pocket.",
    publishApplicationCount: false,
    agencyMarkupBps: null,
  },
  {
    slug: "loom",
    name: "Loom & Co",
    industry: "Fashion",
    employees: 150,
    city: "Mumbai",
    about:
      "Loom & Co is a D2C apparel brand. Design, wholesale, and a lean digital team ship seasonal drops without a holding-company process.",
    publishApplicationCount: false,
    agencyMarkupBps: 1000,
  },
  {
    slug: "atlas",
    name: "Atlas Freight",
    industry: "Logistics",
    employees: 320,
    city: "Chennai",
    about:
      "Atlas Freight moves container and domestic freight for exporters. Dispatch, billing, and a growing platform layer sit next to operations, not above them.",
    publishApplicationCount: false,
    agencyMarkupBps: 800,
  },
  {
    slug: "quartz",
    name: "Quartz Media",
    industry: "Media",
    employees: 95,
    city: "Bengaluru",
    about:
      "Quartz Media publishes trade and consumer titles. The newsroom and a small product team share one CMS and a very public deadline.",
    publishApplicationCount: false,
    agencyMarkupBps: 1000,
  },
];

export const DEMO_INTERVIEWERS: InterviewerDef[] = [
  {
    email: "interviewer.arjun@hireiq.local",
    name: "Arjun Mehta",
    category: "ENGINEERING",
    headline: "Engineering interviewer — systems and backend",
    location: "Bengaluru",
    aboutText:
      "I interview backend and platform engineers for production judgement: isolation, backpressure, incident response. Fifteen years building and reviewing distributed systems. Candidates see this page before they book a slot.",
    roleTitle: "Staff Engineering Interviewer",
    experienceYears: 15,
    domains: ["Engineering"],
    currentTitle: "Staff Engineer",
    currentCompany: "Razorpay",
    priorTitle: "Senior Engineer",
    priorCompany: "Google",
    school: "IIT Madras",
    degree: "B.Tech",
    field: "Computer Science",
  },
  {
    email: "interviewer.kavya@hireiq.local",
    name: "Kavya Iyer",
    category: "PRODUCT",
    headline: "Product interviewer — judgement and written clarity",
    location: "Mumbai",
    aboutText:
      "I interview PMs and analysts on problem framing, evidence, and how they write for operators. I do not score on confidence theatre.",
    roleTitle: "Product Interviewer",
    experienceYears: 11,
    domains: ["Product", "Operations"],
    currentTitle: "Director of Product",
    currentCompany: "CRED",
    priorTitle: "Product Lead",
    priorCompany: "Freshworks",
    school: "ISB Hyderabad",
    degree: "PGP",
    field: "Management",
  },
  {
    email: "interviewer.neha@hireiq.local",
    name: "Neha Kapoor",
    category: "DESIGN",
    headline: "Design interviewer — craft and product sense",
    location: "Bengaluru",
    aboutText:
      "I interview product designers on systems thinking, critique, and whether they can ship with constraints. Portfolios are a starting point, not the interview.",
    roleTitle: "Design Interviewer",
    experienceYears: 12,
    domains: ["Design"],
    currentTitle: "Design Director",
    currentCompany: "PhonePe",
    priorTitle: "Lead Product Designer",
    priorCompany: "Flipkart",
    school: "NID Ahmedabad",
    degree: "GDPD",
    field: "Industrial Design",
  },
  {
    email: "interviewer.sameer@hireiq.local",
    name: "Sameer Khan",
    category: "DATA_SCIENCE",
    headline: "Data interviewer — measurement and modelling judgement",
    location: "Hyderabad",
    aboutText:
      "I interview analysts and applied scientists on whether they can define a metric, defend a model, and say when the data is not enough.",
    roleTitle: "Data Science Interviewer",
    experienceYears: 13,
    domains: ["Data", "Analytics"],
    currentTitle: "Head of Data",
    currentCompany: "Swiggy",
    priorTitle: "Staff Data Scientist",
    priorCompany: "Amazon",
    school: "IIT Kharagpur",
    degree: "M.Tech",
    field: "Computer Science",
  },
  {
    email: "interviewer.diya@hireiq.local",
    name: "Diya Patel",
    category: "ENGINEERING",
    headline: "Frontend interviewer — product engineering",
    location: "Pune",
    aboutText:
      "I interview frontend and full-stack engineers on accessibility, state, and how they work with design without throwing tickets over a wall.",
    roleTitle: "Frontend Interviewer",
    experienceYears: 10,
    domains: ["Engineering"],
    currentTitle: "Staff Frontend Engineer",
    currentCompany: "Zerodha",
    priorTitle: "Senior Engineer",
    priorCompany: "BrowserStack",
    school: "BITS Pilani",
    degree: "B.E.",
    field: "Computer Science",
  },
  {
    email: "interviewer.rohan@hireiq.local",
    name: "Rohan Desai",
    category: "PRODUCT",
    headline: "Commercial interviewer — sales judgement and discovery",
    location: "Mumbai",
    aboutText:
      "I interview account executives on discovery, pipeline honesty, and whether they can write a deal note a founder would sign.",
    roleTitle: "Commercial Interviewer",
    experienceYears: 14,
    domains: ["Sales", "Product"],
    currentTitle: "VP Sales",
    currentCompany: "Chargebee",
    priorTitle: "Sales Lead",
    priorCompany: "Freshworks",
    school: "NMIMS Mumbai",
    degree: "MBA",
    field: "Marketing",
  },
  {
    email: "interviewer.ishita@hireiq.local",
    name: "Ishita Bose",
    category: "DESIGN",
    headline: "Brand and content interviewer",
    location: "Kolkata",
    aboutText:
      "I interview designers and content leads on taste, systems, and whether they can defend a direction without jargon.",
    roleTitle: "Brand Interviewer",
    experienceYears: 9,
    domains: ["Design", "Brand"],
    currentTitle: "Head of Brand",
    currentCompany: "Mamaearth",
    priorTitle: "Art Director",
    priorCompany: "Ogilvy",
    school: "JJ School of Art",
    degree: "BFA",
    field: "Applied Art",
  },
  {
    email: "interviewer.vikrant@hireiq.local",
    name: "Vikrant Shah",
    category: "ENGINEERING",
    headline: "Platform interviewer — reliability and operations",
    location: "Chennai",
    aboutText:
      "I interview platform and SRE-shaped engineers on incidents, capacity, and whether they can explain a trade-off to someone who is on-call tonight.",
    roleTitle: "Platform Interviewer",
    experienceYears: 16,
    domains: ["Engineering", "Infrastructure"],
    currentTitle: "Principal Engineer",
    currentCompany: "Postman",
    priorTitle: "SRE Lead",
    priorCompany: "Microsoft",
    school: "IIT Bombay",
    degree: "B.Tech",
    field: "Electrical Engineering",
  },
];

/** Assigned only to Harbor Pay jobs. Not part of the shared round-robin. */
export const HARBOR_ONLY_INTERVIEWER: InterviewerDef = {
  email: "interviewer.meera.harbor@hireiq.local",
  name: "Meera Shah",
  category: "PRODUCT",
  headline: "Harbor Pay interviewer — payments operations",
  location: "Mumbai",
  aboutText:
    "I interview only for Harbor Pay. The conversations are about settlement exceptions, reconciliation, and whether a candidate can explain a money-movement failure.",
  roleTitle: "Payments Interviewer",
  experienceYears: 12,
  domains: ["Payments", "Operations"],
  currentTitle: "Head of Payments",
  currentCompany: "Harbor Pay",
  priorTitle: "Operations Lead",
  priorCompany: "Razorpay",
  school: "IIM Ahmedabad",
  degree: "MBA",
  field: "Finance",
};

export const PIPELINE_PACK: PipelineSeat[] = [
  {
    key: "applied",
    status: "CV_POOL",
    scoreFraction: null,
    interviews: [],
    interviewResult: null,
    offer: "none",
    bill: false,
    source: "HOSTED_APPLY",
  },
  {
    key: "review",
    status: "EXPERT_REVIEW",
    scoreFraction: null,
    interviews: [],
    interviewResult: null,
    offer: "none",
    bill: false,
    source: "HOSTED_APPLY",
  },
  {
    key: "eval",
    status: "TECH_EVALUATION",
    scoreFraction: 0.64,
    interviews: ["PHONE_SCREEN"],
    interviewResult: "PENDING",
    offer: "none",
    bill: false,
    source: "REFERRAL",
  },
  {
    key: "shortlist",
    status: "SHORTLISTED",
    scoreFraction: 0.76,
    interviews: ["PHONE_SCREEN", "TECHNICAL"],
    interviewResult: "PASSED",
    offer: "none",
    bill: false,
    source: "HOSTED_APPLY",
  },
  {
    key: "offer",
    status: "SELECTED",
    scoreFraction: 0.84,
    interviews: ["PHONE_SCREEN", "TECHNICAL"],
    interviewResult: "PASSED",
    offer: "minted",
    bill: false,
    source: "HOSTED_APPLY",
  },
  {
    key: "hire",
    status: "HIRED",
    scoreFraction: 0.91,
    interviews: ["PHONE_SCREEN", "TECHNICAL"],
    interviewResult: "PASSED",
    offer: "accepted",
    bill: true,
    source: "HOSTED_APPLY",
  },
  {
    key: "reject",
    status: "REJECTED",
    scoreFraction: 0.31,
    interviews: [],
    interviewResult: "FAILED",
    offer: "none",
    bill: false,
    source: "MANUAL",
  },
  {
    key: "decline",
    status: "REJECTED",
    scoreFraction: 0.72,
    interviews: ["PHONE_SCREEN", "TECHNICAL"],
    interviewResult: "PASSED",
    offer: "declined",
    bill: false,
    source: "HOSTED_APPLY",
  },
];

const FIRST_NAMES = [
  "Asha",
  "Kabir",
  "Leela",
  "Imran",
  "Sana",
  "Yusuf",
  "Tara",
  "Nikhil",
  "Rhea",
  "Farhan",
  "Aditi",
  "Varun",
  "Nisha",
  "Karan",
  "Pooja",
  "Harsh",
];

const LAST_NAMES = [
  "Sen",
  "Pillai",
  "Bhat",
  "Khanna",
  "Reddy",
  "Gupta",
  "Das",
  "Kulkarni",
  "Malhotra",
  "Nair",
  "Banerjee",
  "Joshi",
  "Kapoor",
  "Shetty",
  "Agarwal",
  "Iqbal",
];

export function demoApplicant(input: {
  slug: string;
  jobKey: string;
  seatIndex: number;
  city: string;
}): { name: string; email: string; location: string } {
  const first = FIRST_NAMES[input.seatIndex % FIRST_NAMES.length]!;
  const last =
    LAST_NAMES[(input.seatIndex + input.jobKey.length) % LAST_NAMES.length]!;
  return {
    name: `${first} ${last}`,
    email: `${input.slug}.${input.jobKey}.${input.seatIndex}@demo.hireiq.local`,
    location: input.city,
  };
}

function bullets(lines: string[]): string {
  return lines.join("\n");
}

export function rolesForCompany(company: CompanyDef): RoleSpec[] {
  const locHybrid = `${company.city} (Hybrid)`;
  const locRemote = `Remote (India)`;
  const about = company.about;

  return [
    {
      key: "backend",
      title: `${company.name}: Senior Backend Engineer`,
      roleCategory: "ENGINEERING",
      experienceRange: "5-9 years",
      location: locHybrid,
      compensationRange: "₹45L – ₹65L",
      primarySkills: "Go, PostgreSQL, Kubernetes, Redis",
      mustHaveRequirements: bullets([
        "5–9 years building backend systems in production.",
        "Strong distributed systems and SQL depth — you have operated multi-tenant services.",
        "Comfortable owning on-call, instrumentation, and operational quality.",
        "Clear written design: you can explain a trade-off without a slide deck.",
      ]),
      niceToHaveRequirements: bullets([
        "gRPC or event-driven architecture in production.",
        "Prior startup experience shipping with a small team.",
      ]),
      jobDescription: `As a senior backend engineer at ${company.name} you design the services, APIs, and data models that keep the product honest under load. You will work with product and infra — not through a ticket queue — and you will be evaluated on a skills assessment plus an expert interview, not a keyword scan.`,
      evaluationCriteria: "System design depth, coding quality, operational maturity",
      interviewRoundPlan: ["PHONE_SCREEN", "TECHNICAL", "SYSTEM_DESIGN"],
      numberOfPositions: 2,
      employmentType: "FULL_TIME",
      seniorityLevel: "SENIOR",
      responsibilities: [
        "Design and build backend services, APIs, and data models.",
        "Own features end-to-end: spec, implementation, rollout, and production follow-through.",
        "Keep isolation, backpressure, and idempotency as first-class constraints.",
        "Review designs and delete work that does not earn its keep.",
      ],
      benefits: [
        "₹45L – ₹65L CTC, scoped to the level and discussed early.",
        `Hybrid ${company.city}: in-person collaboration with remote-friendly writing.`,
        "A hiring process you can see — role assessment, expert interview, written trail.",
      ],
      aboutCompany: about,
    },
    {
      key: "frontend",
      title: `${company.name}: Senior Frontend Engineer`,
      roleCategory: "ENGINEERING",
      experienceRange: "4-8 years",
      location: locHybrid,
      compensationRange: "₹38L – ₹55L",
      primarySkills: "TypeScript, React, Accessibility, Design systems",
      mustHaveRequirements: bullets([
        "4–8 years shipping product UI in TypeScript.",
        "You treat accessibility and performance as product requirements, not polish.",
        "You can work with design on a system, not a pile of screens.",
      ]),
      niceToHaveRequirements: bullets([
        "Next.js or similar SSR experience.",
        "You have maintained a design-system package.",
      ]),
      jobDescription: `${company.name} needs a senior frontend engineer who can own product surfaces with design, not throw tickets. Assessment plus expert interview — no whiteboard theatre.`,
      evaluationCriteria: "Product craft, TypeScript depth, accessibility judgement",
      interviewRoundPlan: ["PHONE_SCREEN", "TECHNICAL"],
      numberOfPositions: 2,
      employmentType: "FULL_TIME",
      seniorityLevel: "SENIOR",
      responsibilities: [
        "Ship product UI with TypeScript and a shared design system.",
        "Own accessibility, empty states, and performance on the surfaces customers touch.",
        "Pair with design and backend on contracts, not screenshots.",
      ],
      benefits: [
        "₹38L – ₹55L CTC.",
        `Hybrid ${company.city}.`,
        "Transparent hiring: assessment plus expert review.",
      ],
      aboutCompany: about,
    },
    {
      key: "designer",
      title: `${company.name}: Product Designer`,
      roleCategory: "DESIGN",
      experienceRange: "3-7 years",
      location: locHybrid,
      compensationRange: "₹28L – ₹42L",
      primarySkills: "Product design, Systems, Critique, Figma",
      mustHaveRequirements: bullets([
        "3–7 years designing product surfaces that shipped.",
        "You can run critique and write the decision, not only the file.",
        "Comfortable in a system: tokens, components, and empty states.",
      ]),
      niceToHaveRequirements: bullets([
        "B2B or ops-tooling experience.",
        "Motion or content-design depth.",
      ]),
      jobDescription: `Product design at ${company.name} is systems work. You will be assessed on craft and judgement, then interviewed by a practising designer — not a hiring-manager vibe check.`,
      evaluationCriteria: "Systems thinking, craft, written critique",
      interviewRoundPlan: ["PHONE_SCREEN", "TECHNICAL"],
      numberOfPositions: 1,
      employmentType: "FULL_TIME",
      seniorityLevel: "INTERMEDIATE",
      responsibilities: [
        "Design product flows and the system underneath them.",
        "Write decisions so engineering can implement without a second meeting.",
        "Hold the quality bar in critique without theatre.",
      ],
      benefits: [
        "₹28L – ₹42L CTC.",
        `Hybrid ${company.city}.`,
        "Work directly with engineering and the people who use the product.",
      ],
      aboutCompany: about,
    },
    {
      key: "sales",
      title: `${company.name}: Account Executive`,
      roleCategory: "SALES",
      experienceRange: "3-6 years",
      location: company.city,
      compensationRange: "₹18L – ₹32L + variable",
      primarySkills: "Discovery, Pipeline hygiene, Written deal notes",
      mustHaveRequirements: bullets([
        "3–6 years selling to operators or mid-market buyers.",
        "You write a deal note a founder can act on.",
        "Honest pipeline: you do not forecast theatre.",
      ]),
      niceToHaveRequirements: bullets([
        "SaaS or services experience in India.",
        "Comfortable with a technical product.",
      ]),
      jobDescription: `${company.name} is hiring an account executive who can run discovery and keep a clean pipeline. The process is a role assessment plus an expert interview — not a charm screen.`,
      evaluationCriteria: "Discovery quality, pipeline honesty, written clarity",
      interviewRoundPlan: ["PHONE_SCREEN", "HR"],
      numberOfPositions: 2,
      employmentType: "FULL_TIME",
      seniorityLevel: "INTERMEDIATE",
      responsibilities: [
        "Run discovery with operators who do not have time for a pitch deck.",
        "Keep pipeline hygiene that leadership can trust.",
        "Write deal notes; close without discount theatre.",
      ],
      benefits: [
        "₹18L – ₹32L + variable.",
        `Based in ${company.city} with travel as the territory needs.`,
        "Transparent hiring process.",
      ],
      aboutCompany: about,
    },
    {
      key: "finance",
      title: `${company.name}: Revenue Operations Analyst`,
      roleCategory: "FINANCE",
      experienceRange: "2-5 years",
      location: locRemote,
      compensationRange: "₹18L – ₹28L",
      primarySkills: "SQL, Excel modelling, Billing reconciliation",
      mustHaveRequirements: bullets([
        "2–5 years in revops, finance analytics, or billing operations.",
        "Advanced SQL and comfort reconciling messy invoice-level data.",
        "You write clearly: a cohort note a founder can act on.",
      ]),
      niceToHaveRequirements: bullets([
        "SaaS billing exposure (usage, seats, credits).",
        "Looker or Tableau for self-serve reporting.",
      ]),
      jobDescription: `Keep ${company.name}'s revenue numbers honest. You reconcile invoices, analyse cohorts, and sit with engineering when automation should replace a spreadsheet. Remote, high agency, and a hiring process that tests the work.`,
      evaluationCriteria: "Analytical rigour, reconciliation accuracy, communication",
      interviewRoundPlan: ["PHONE_SCREEN", "TECHNICAL", "HR"],
      numberOfPositions: 1,
      employmentType: "FULL_TIME",
      seniorityLevel: "INTERMEDIATE",
      responsibilities: [
        "Reconcile invoices and credits so billed revenue matches usage.",
        "Build cohort and leakage analyses that finance can trust.",
        "Partner with engineering on billing automation.",
      ],
      benefits: [
        "₹18L – ₹28L CTC.",
        "Remote (India) with overlap on IST working hours.",
        "Direct line to billing and product.",
      ],
      aboutCompany: about,
    },
    {
      key: "platform",
      title: `${company.name}: Platform Engineer`,
      roleCategory: "ENGINEERING",
      experienceRange: "5-10 years",
      location: locHybrid,
      compensationRange: "₹42L – ₹62L",
      primarySkills: "SRE, Kubernetes, Observability, Capacity",
      mustHaveRequirements: bullets([
        "5–10 years in platform, SRE, or infrastructure engineering.",
        "You have owned incidents and written the follow-through.",
        "Comfortable explaining capacity and failure modes to product.",
      ]),
      niceToHaveRequirements: bullets([
        "Multi-tenant SaaS operations.",
        "Terraform or equivalent as daily work, not a side project.",
      ]),
      jobDescription: `Platform engineering at ${company.name} is production ownership: capacity, observability, and the boring work that keeps the product up. Assessed, then interviewed by a practising platform engineer.`,
      evaluationCriteria: "Operational judgement, incident quality, systems reasoning",
      interviewRoundPlan: ["PHONE_SCREEN", "TECHNICAL", "SYSTEM_DESIGN"],
      numberOfPositions: 1,
      employmentType: "FULL_TIME",
      seniorityLevel: "SENIOR",
      responsibilities: [
        "Own reliability, capacity, and the on-call path.",
        "Make observability a product constraint, not a dashboard hobby.",
        "Partner with backend on tenancy, backpressure, and deploys.",
      ],
      benefits: [
        "₹42L – ₹62L CTC.",
        `Hybrid ${company.city}.`,
        "High ownership, small team.",
      ],
      aboutCompany: about,
    },
  ];
}
