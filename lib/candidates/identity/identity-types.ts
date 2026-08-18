import type {
  CandidateIdentityDecisionType,
  CandidateIdentitySignalKind,
  PortalRole,
} from "@prisma/client";

import type { IdentityReasonCode } from "@/lib/validation/candidate-identity-validation";

export type IdentityStatus = "NOT_LINKED" | "LINKED" | "POSSIBLE_DUPLICATES";

export type MaskedIdentitySignal = {
  id: number;
  kind: CandidateIdentitySignalKind;
  maskedValue: string;
  sourceChannel: string | null;
  duplicateReason: IdentityReasonCode;
};

export type IdentityLinkedCandidate = {
  candidateId: number;
  name: string;
  location: string | null;
  currentEmployer: string | null;
};

export type PossibleDuplicateMatch = {
  candidateId: number;
  name: string;
  location: string | null;
  currentEmployer: string | null;
  matchingReasons: IdentityReasonCode[];
  alreadyLinkedToSamePerson: boolean;
  belongsToDifferentCompanyPerson: boolean;
};

export type IdentityDecisionSummary = {
  id: number;
  decision: CandidateIdentityDecisionType;
  reasonCodes: string[];
  leftCandidateId: number;
  rightCandidateId: number;
  actorUserId: number | null;
  actorName: string | null;
  createdAt: Date;
};

export type CandidateIdentityExplanation = {
  candidateId: number;
  companyPersonId: number | null;
  status: IdentityStatus;
  linkedCandidates: IdentityLinkedCandidate[];
  signals: MaskedIdentitySignal[];
  possibleDuplicates: PossibleDuplicateMatch[];
  decisions: IdentityDecisionSummary[];
};

export function assertIdentityManagerRole(role: PortalRole) {
  return role === "ADMIN";
}
