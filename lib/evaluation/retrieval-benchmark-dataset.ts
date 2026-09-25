import type { SyntheticRetrievalJudgment } from "@/lib/retrieval/lexical-retrieval-types";

/**
 * Frozen M8 synthetic retrieval cases.
 * Dataset label is SYNTHETIC_NOT_RECRUITER_OUTCOMES.
 * Do not edit these examples to favor a later retrieval method.
 */
export const RETRIEVAL_BENCHMARK_DATASET_LABEL =
  "SYNTHETIC_NOT_RECRUITER_OUTCOMES" as const;

/** Frozen M8/M9 comparison snapshot. Do not bump to change cases. */
export const RETRIEVAL_BENCHMARK_DATASET_VERSION = "m8-frozen-v1";

export type RetrievalBenchmarkCase = {
  id: string;
  jobPrimarySkills: string;
  jobDescription: string | null;
  applications: Array<{
    applicationId: number;
    candidateId: number;
    companyId: number;
    jobId: number;
    text: string;
    revoked?: boolean;
    superseded?: boolean;
  }>;
  judgments: SyntheticRetrievalJudgment[];
};

export const RETRIEVAL_BENCHMARK_CASES: RetrievalBenchmarkCase[] = [
  {
    id: "exact-python",
    jobPrimarySkills: "Python",
    jobDescription:
      "We are a kind team that values curiosity and collaboration daily.",
    applications: [
      {
        applicationId: 2,
        candidateId: 2,
        companyId: 1,
        jobId: 10,
        text: "Java backend development",
      },
      {
        applicationId: 1,
        candidateId: 1,
        companyId: 1,
        jobId: 10,
        text: "Python backend development",
      },
    ],
    judgments: [
      {
        datasetLabel: RETRIEVAL_BENCHMARK_DATASET_LABEL,
        applicationId: 1,
        label: "STRONGLY_RELEVANT",
      },
      {
        datasetLabel: RETRIEVAL_BENCHMARK_DATASET_LABEL,
        applicationId: 2,
        label: "NOT_RELEVANT",
      },
    ],
  },
  {
    id: "alias-javascript",
    jobPrimarySkills: "JavaScript",
    jobDescription: null,
    applications: [
      {
        applicationId: 1,
        candidateId: 1,
        companyId: 1,
        jobId: 10,
        text: "Built UI in JS.",
      },
    ],
    judgments: [
      {
        datasetLabel: RETRIEVAL_BENCHMARK_DATASET_LABEL,
        applicationId: 1,
        label: "RELEVANT",
      },
    ],
  },
  {
    id: "false-friend-react-native",
    jobPrimarySkills: "React",
    jobDescription: null,
    applications: [
      {
        applicationId: 1,
        candidateId: 1,
        companyId: 1,
        jobId: 10,
        text: "Shipped a React Native app only.",
      },
    ],
    judgments: [
      {
        datasetLabel: RETRIEVAL_BENCHMARK_DATASET_LABEL,
        applicationId: 1,
        label: "NOT_RELEVANT",
      },
    ],
  },
  {
    id: "negation-django",
    jobPrimarySkills: "Django",
    jobDescription: null,
    applications: [
      {
        applicationId: 1,
        candidateId: 1,
        companyId: 1,
        jobId: 10,
        text: "Python experience, no Django experience.",
      },
    ],
    judgments: [
      {
        datasetLabel: RETRIEVAL_BENCHMARK_DATASET_LABEL,
        applicationId: 1,
        label: "NOT_RELEVANT",
      },
    ],
  },
  {
    id: "missing-evidence",
    jobPrimarySkills: "Python",
    jobDescription:
      "We are a kind team that values curiosity and collaboration daily.",
    applications: [
      {
        applicationId: 1,
        candidateId: 1,
        companyId: 1,
        jobId: 10,
        text: "Hello.",
      },
    ],
    judgments: [
      {
        datasetLabel: RETRIEVAL_BENCHMARK_DATASET_LABEL,
        applicationId: 1,
        label: "NOT_RELEVANT",
      },
    ],
  },
];
