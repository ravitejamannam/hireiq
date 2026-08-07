import type { CandidateStatus } from "@prisma/client";

export type Candidate = {
  id: number;
  name: string;
  role: string;
  experienceYears: number;
  status: CandidateStatus;
  companyId: number;
};