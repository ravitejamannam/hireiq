import type {
  ApplicationPipelineStatus,
  BillingStatus,
  JobStatus,
  RequirementLifecycle,
} from "@prisma/client";

export type BillingLineItemView = {
  id: number;
  applicationId: number;
  placedCtcCents?: number | null;
  markupBps?: number | null;
  feeCents?: number | null;
  compensationRecordedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  application: {
    id: number;
    status: ApplicationPipelineStatus;
    candidateId: number;
    candidate: {
      name: string;
      role: string;
    };
  };
};

export type BillingRecordView = {
  id: number;
  status: BillingStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
  companyId: number;
  jobId: number;
  company: { id: number; name: string };
  job: {
    id: number;
    title: string;
    status: JobStatus;
    requirementLifecycle: RequirementLifecycle;
  };
  lineItems: BillingLineItemView[];
};
