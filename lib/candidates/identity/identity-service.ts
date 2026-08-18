import {
  CandidateIdentityDecisionType,
  CandidateIdentitySignalKind,
  PortalRole,
} from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import {
  CandidateIdentityError,
  IDENTITY_CROSS_COMPANY_CODE,
  IDENTITY_GROUP_CONFLICT_CODE,
  IDENTITY_NOT_FOUND,
} from "@/lib/candidates/identity/identity-errors";
import {
  extractSignalsFromIngestionEvent,
  maskIdentitySignalValue,
} from "@/lib/candidates/identity/identity-signals";
import type {
  CandidateIdentityExplanation,
  IdentityDecisionSummary,
  IdentityLinkedCandidate,
  IdentityStatus,
  MaskedIdentitySignal,
  PossibleDuplicateMatch,
} from "@/lib/candidates/identity/identity-types";
import { prisma } from "@/lib/prisma";
import {
  addMembership,
  createCompanyPerson,
  createDecision,
  createSignal,
  deleteCompanyPersonIfEmpty,
  findActorUserName,
  findCandidateHandle,
  findCandidateHandleInCompany,
  findPossibleDuplicates,
  getCompanyPersonForCandidate,
  getIdentityDecisions,
  getMembership,
  getMembershipsForCandidates,
  getSignalsForCandidate,
  listIngestionEventsForCandidate,
  listMembershipsForCompanyPerson,
  removeMembership,
} from "@/lib/repositories/candidate-identity-repository";
import {
  CandidateIdentityValidationError,
  IDENTITY_SELF_LINK,
  rejectBrowserTenantAuthority,
  validateIdentityCandidateId,
  validateLinkCandidateIds,
  type IdentityReasonCode,
} from "@/lib/validation/candidate-identity-validation";

function duplicateReasonForKind(
  kind: CandidateIdentitySignalKind,
): IdentityReasonCode {
  switch (kind) {
    case CandidateIdentitySignalKind.EMAIL:
      return "EMAIL_EXACT";
    case CandidateIdentitySignalKind.PHONE:
      return "PHONE_EXACT";
    case CandidateIdentitySignalKind.LINKEDIN_URL:
      return "LINKEDIN_URL_EXACT";
    case CandidateIdentitySignalKind.PROVIDER_CANDIDATE_ID:
      return "PROVIDER_CANDIDATE_ID";
    default:
      return "MANUAL_REVIEW";
  }
}

function identityNotFound(): never {
  throw new CandidateIdentityError("Resource not found.", IDENTITY_NOT_FOUND);
}

export function assertCanManageCandidateIdentity(role: PortalRole) {
  if (role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireIdentityAdmin() {
  const user = await requireAdmin();
  assertCanManageCandidateIdentity(user.role);
  return user;
}

async function loadSameCompanyCandidates(
  leftCandidateId: number,
  rightCandidateId: number,
) {
  const [left, right] = await Promise.all([
    findCandidateHandle(leftCandidateId),
    findCandidateHandle(rightCandidateId),
  ]);

  if (!left || !right) {
    identityNotFound();
  }

  if (left.companyId !== right.companyId) {
    throw new CandidateIdentityError(
      "Candidates from different companies cannot be linked.",
      IDENTITY_CROSS_COMPANY_CODE,
    );
  }

  return { left, right, companyId: left.companyId };
}

export async function recordIdentitySignalsForCandidate(
  candidateId: number,
  companyId: number,
) {
  const candidate = await findCandidateHandleInCompany(candidateId, companyId);
  if (!candidate) {
    identityNotFound();
  }

  const events = await listIngestionEventsForCandidate(candidateId, companyId);
  for (const event of events) {
    if (event.companyId !== companyId || event.candidateId !== candidateId) {
      continue;
    }

    const submission =
      event.hostedApplySubmission &&
      event.hostedApplySubmission.companyId === companyId
        ? event.hostedApplySubmission
        : null;

    const derived = extractSignalsFromIngestionEvent(
      {
        id: event.id,
        companyId: event.companyId,
        candidateId: event.candidateId,
        sourceChannel: event.sourceChannel,
        applicantEmailNormalized: event.applicantEmailNormalized,
        applicantPhone: event.applicantPhone,
        applicantLinkedInUrl: event.applicantLinkedInUrl,
        externalCandidateId: event.externalCandidateId,
        hostedApplySubmissionId: event.hostedApplySubmissionId,
        distributionId: event.distributionId,
      },
      submission,
    );

    const providerConnectionId =
      event.distribution?.providerConnectionId ?? null;

    for (const signal of derived) {
      await createSignal({
        companyId,
        candidateId,
        kind: signal.kind,
        normalizedValue: signal.normalizedValue,
        sourceChannel: signal.sourceChannel,
        ingestionEventId: signal.ingestionEventId,
        hostedApplySubmissionId: signal.hostedApplySubmissionId,
        providerConnectionId,
      });
    }
  }
}

async function possibleDuplicatesForCandidate(
  candidateId: number,
  companyId: number,
): Promise<PossibleDuplicateMatch[]> {
  const signals = await getSignalsForCandidate(candidateId, companyId);
  const matches = await findPossibleDuplicates(
    candidateId,
    companyId,
    signals.map((signal) => ({
      kind: signal.kind,
      normalizedValue: signal.normalizedValue,
    })),
  );

  const otherIds = [...new Set(matches.map((row) => row.candidateId))];
  const memberships = await getMembershipsForCandidates(
    [candidateId, ...otherIds],
    companyId,
  );
  const selfMembership = memberships.find((row) => row.candidateId === candidateId);
  const membershipByCandidate = new Map(
    memberships.map((row) => [row.candidateId, row.companyPersonId]),
  );

  const grouped = new Map<number, PossibleDuplicateMatch>();
  for (const row of matches) {
    if (row.companyId !== companyId || row.candidate.companyId !== companyId) {
      continue;
    }

    const reason = duplicateReasonForKind(row.kind);
    const existing = grouped.get(row.candidateId);
    const otherPersonId = membershipByCandidate.get(row.candidateId) ?? null;
    const alreadyLinkedToSamePerson =
      selfMembership !== undefined &&
      otherPersonId === selfMembership.companyPersonId;
    const belongsToDifferentCompanyPerson =
      selfMembership !== undefined &&
      otherPersonId !== null &&
      otherPersonId !== selfMembership.companyPersonId;

    if (existing) {
      if (!existing.matchingReasons.includes(reason)) {
        existing.matchingReasons.push(reason);
      }
      continue;
    }

    grouped.set(row.candidateId, {
      candidateId: row.candidate.id,
      name: row.candidate.name,
      location: row.candidate.location,
      currentEmployer: row.candidate.currentEmployer,
      matchingReasons: [reason],
      alreadyLinkedToSamePerson,
      belongsToDifferentCompanyPerson,
    });
  }

  return [...grouped.values()];
}

function resolveStatus(
  companyPersonId: number | null,
  linkedCount: number,
  possibleDuplicates: PossibleDuplicateMatch[],
): IdentityStatus {
  if (companyPersonId && linkedCount > 0) {
    return "LINKED";
  }
  if (possibleDuplicates.some((row) => !row.alreadyLinkedToSamePerson)) {
    return "POSSIBLE_DUPLICATES";
  }
  return "NOT_LINKED";
}

async function buildExplanation(
  candidateId: number,
  companyId: number,
): Promise<CandidateIdentityExplanation> {
  await recordIdentitySignalsForCandidate(candidateId, companyId);

  const candidate = await findCandidateHandleInCompany(candidateId, companyId);
  if (!candidate) {
    identityNotFound();
  }

  const companyPerson = await getCompanyPersonForCandidate(candidateId, companyId);
  const memberships = companyPerson
    ? await listMembershipsForCompanyPerson(companyPerson.id, companyId)
    : [];
  const linkedIds = memberships
    .map((row) => row.candidateId)
    .filter((id) => id !== candidateId);

  const linkedCandidates: IdentityLinkedCandidate[] = [];
  for (const linkedId of linkedIds) {
    const handle = await findCandidateHandleInCompany(linkedId, companyId);
    if (handle && handle.companyId === companyId) {
      linkedCandidates.push({
        candidateId: handle.id,
        name: handle.name,
        location: handle.location,
        currentEmployer: handle.currentEmployer,
      });
    }
  }

  const signalRows = await getSignalsForCandidate(candidateId, companyId);
  const signals: MaskedIdentitySignal[] = signalRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    maskedValue: maskIdentitySignalValue(row.kind, row.normalizedValue),
    sourceChannel: row.sourceChannel,
    duplicateReason: duplicateReasonForKind(row.kind),
  }));

  const possibleDuplicates = await possibleDuplicatesForCandidate(
    candidateId,
    companyId,
  );

  const decisionRows = await getIdentityDecisions(candidateId, companyId);
  const decisions: IdentityDecisionSummary[] = [];
  for (const row of decisionRows) {
    const actor = await findActorUserName(row.actorUserId);
    decisions.push({
      id: row.id,
      decision: row.decision,
      reasonCodes: row.reasonCodes,
      leftCandidateId: row.leftCandidateId,
      rightCandidateId: row.rightCandidateId,
      actorUserId: row.actorUserId,
      actorName: actor?.name ?? null,
      createdAt: row.createdAt,
    });
  }

  return {
    candidateId,
    companyPersonId: companyPerson?.id ?? null,
    status: resolveStatus(
      companyPerson?.id ?? null,
      linkedCandidates.length,
      possibleDuplicates,
    ),
    linkedCandidates,
    signals,
    possibleDuplicates: possibleDuplicates.filter(
      (row) => !row.alreadyLinkedToSamePerson,
    ),
    decisions,
  };
}

export async function executeLinkCandidates(params: {
  leftCandidateId: number;
  rightCandidateId: number;
  actorUserId: number | null;
}) {
  if (params.leftCandidateId === params.rightCandidateId) {
    throw new CandidateIdentityValidationError(
      "A candidate cannot be linked to itself.",
      IDENTITY_SELF_LINK,
    );
  }

  const { left, right, companyId } = await loadSameCompanyCandidates(
    params.leftCandidateId,
    params.rightCandidateId,
  );

  const existing = await getMembershipsForCandidates(
    [left.id, right.id],
    companyId,
  );
  const existingLeft = existing.find((row) => row.candidateId === left.id);
  const existingRight = existing.find((row) => row.candidateId === right.id);
  if (
    existingLeft &&
    existingRight &&
    existingLeft.companyPersonId !== existingRight.companyPersonId
  ) {
    await createDecision({
      companyId,
      decision: CandidateIdentityDecisionType.NEEDS_REVIEW,
      reasonCodes: ["IDENTITY_GROUP_CONFLICT"],
      leftCandidateId: left.id,
      rightCandidateId: right.id,
      actorUserId: params.actorUserId,
    });
    throw new CandidateIdentityError(
      "These candidates already belong to different identity groups. Groups are not merged automatically.",
      IDENTITY_GROUP_CONFLICT_CODE,
    );
  }

  return prisma.$transaction(async (tx) => {
    const memberships = await getMembershipsForCandidates(
      [left.id, right.id],
      companyId,
      tx,
    );
    const leftMembership = memberships.find((row) => row.candidateId === left.id);
    const rightMembership = memberships.find(
      (row) => row.candidateId === right.id,
    );

    if (
      leftMembership &&
      rightMembership &&
      leftMembership.companyPersonId !== rightMembership.companyPersonId
    ) {
      throw new CandidateIdentityError(
        "These candidates already belong to different identity groups. Groups are not merged automatically.",
        IDENTITY_GROUP_CONFLICT_CODE,
      );
    }

    if (
      leftMembership &&
      rightMembership &&
      leftMembership.companyPersonId === rightMembership.companyPersonId
    ) {
      return {
        companyPersonId: leftMembership.companyPersonId,
        idempotent: true as const,
      };
    }

    let companyPersonId: number;
    if (!leftMembership && !rightMembership) {
      const person = await createCompanyPerson(companyId, tx);
      await addMembership(person.id, left.id, companyId, tx);
      await addMembership(person.id, right.id, companyId, tx);
      companyPersonId = person.id;
    } else if (leftMembership && !rightMembership) {
      await addMembership(leftMembership.companyPersonId, right.id, companyId, tx);
      companyPersonId = leftMembership.companyPersonId;
    } else if (!leftMembership && rightMembership) {
      await addMembership(rightMembership.companyPersonId, left.id, companyId, tx);
      companyPersonId = rightMembership.companyPersonId;
    } else {
      throw new CandidateIdentityError(
        "These candidates already belong to different identity groups. Groups are not merged automatically.",
        IDENTITY_GROUP_CONFLICT_CODE,
      );
    }

    await createDecision(
      {
        companyId,
        decision: CandidateIdentityDecisionType.LINK,
        reasonCodes: ["ADMIN_LINK"],
        leftCandidateId: left.id,
        rightCandidateId: right.id,
        actorUserId: params.actorUserId,
      },
      tx,
    );

    return { companyPersonId, idempotent: false as const };
  });
}

export async function executeUnlinkCandidate(params: {
  candidateId: number;
  actorUserId: number | null;
}) {
  const candidate = await findCandidateHandle(params.candidateId);
  if (!candidate) {
    identityNotFound();
  }

  const companyId = candidate.companyId;

  return prisma.$transaction(async (tx) => {
    const membership = await getMembership(candidate.id, companyId, tx);
    if (!membership) {
      return { unlinked: false as const, companyPersonId: null };
    }

    const siblings = await listMembershipsForCompanyPerson(
      membership.companyPersonId,
      companyId,
      tx,
    );
    const sibling =
      siblings.find((row) => row.candidateId !== candidate.id) ?? membership;

    await removeMembership(candidate.id, companyId, tx);
    await deleteCompanyPersonIfEmpty(
      membership.companyPersonId,
      companyId,
      tx,
    );

    await createDecision(
      {
        companyId,
        decision: CandidateIdentityDecisionType.NO_LINK,
        reasonCodes: ["ADMIN_UNLINK"],
        leftCandidateId: candidate.id,
        rightCandidateId: sibling.candidateId,
        actorUserId: params.actorUserId,
      },
      tx,
    );

    return {
      unlinked: true as const,
      companyPersonId: membership.companyPersonId,
    };
  });
}

export async function getCandidateIdentity(candidateIdInput: unknown) {
  await requireIdentityAdmin();
  const candidateId = validateIdentityCandidateId(candidateIdInput);
  const candidate = await findCandidateHandle(candidateId);
  if (!candidate) {
    identityNotFound();
  }
  return buildExplanation(candidate.id, candidate.companyId);
}

export async function findPossibleCandidateDuplicates(candidateIdInput: unknown) {
  await requireIdentityAdmin();
  const candidateId = validateIdentityCandidateId(candidateIdInput);
  const candidate = await findCandidateHandle(candidateId);
  if (!candidate) {
    identityNotFound();
  }
  await recordIdentitySignalsForCandidate(candidate.id, candidate.companyId);
  const duplicates = await possibleDuplicatesForCandidate(
    candidate.id,
    candidate.companyId,
  );
  return duplicates.filter((row) => !row.alreadyLinkedToSamePerson);
}

export async function linkCandidates(
  leftCandidateIdInput: unknown,
  rightCandidateIdInput: unknown,
  browserInput?: unknown,
) {
  const user = await requireIdentityAdmin();
  rejectBrowserTenantAuthority(browserInput);
  const ids = validateLinkCandidateIds(
    leftCandidateIdInput,
    rightCandidateIdInput,
  );
  return executeLinkCandidates({
    leftCandidateId: ids.leftCandidateId,
    rightCandidateId: ids.rightCandidateId,
    actorUserId: user.id,
  });
}

export async function unlinkCandidate(
  candidateIdInput: unknown,
  browserInput?: unknown,
) {
  const user = await requireIdentityAdmin();
  rejectBrowserTenantAuthority(browserInput);
  const candidateId = validateIdentityCandidateId(candidateIdInput);
  return executeUnlinkCandidate({
    candidateId,
    actorUserId: user.id,
  });
}

export async function getIdentityExplanation(candidateIdInput: unknown) {
  return getCandidateIdentity(candidateIdInput);
}

export function isCandidateIdentityActionError(
  error: unknown,
): error is
  | CandidateIdentityError
  | CandidateIdentityValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof CandidateIdentityError ||
    error instanceof CandidateIdentityValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function identityActionErrorMessage(error: unknown) {
  if (error instanceof CandidateIdentityValidationError) {
    return error.message;
  }
  if (error instanceof CandidateIdentityError) {
    return error.message;
  }
  return "Resource not found.";
}
