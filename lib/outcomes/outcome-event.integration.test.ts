import "@/lib/evidence-graph/evidence-graph-test-env";

import { readFileSync } from "fs";
import { join } from "path";

import { afterAll, describe, expect, it } from "vitest";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  JobStatus,
  OutcomeEventActorType,
  OutcomeEventType,
  PortalRole,
  RequirementLifecycle,
} from "@prisma/client";

import { generateBillingForHiredApplication } from "@/lib/billing/generate-hire-billing";
import {
  commitApplicationStatusChange,
  commitOfferDecision,
} from "@/lib/outcomes/outcome-event-writes";
import { prisma } from "@/lib/prisma";

const MARKER = `m13-${process.pid}-${Date.now()}`;
const companyIds: number[] = [];

async function world(label: string) {
  const company = await prisma.company.create({
    data: {
      name: `${MARKER} ${label}`,
      industry: "Test",
      employees: 1,
      publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    },
  });
  companyIds.push(company.id);
  const user = await prisma.user.create({
    data: {
      email: `${MARKER}-${label}@hireiq.test`,
      name: label,
      role: PortalRole.ADMIN,
      passwordHash: "test",
      emailVerifiedAt: new Date(),
    },
  });
  const job = await prisma.job.create({
    data: {
      title: `${label} role`,
      status: JobStatus.OPEN,
      companyId: company.id,
      requirementLifecycle: RequirementLifecycle.SOURCING_SHORTLISTING,
    },
  });
  const candidate = await prisma.candidate.create({
    data: {
      name: `${label} Candidate`,
      role: "Engineer",
      experienceYears: 3,
      status: CandidateStatus.APPLIED,
      companyId: company.id,
    },
  });
  const application = await prisma.application.create({
    data: {
      candidateId: candidate.id,
      jobId: job.id,
      companyId: company.id,
      status: ApplicationPipelineStatus.TECH_EVALUATION,
      rejectionReason: "keep me off the event",
    },
  });
  return { company, user, job, candidate, application };
}

afterAll(async () => {
  if (companyIds.length === 0) return;
  await prisma.outcomeEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.billingLineItem.deleteMany({
    where: { application: { companyId: { in: companyIds } } },
  });
  await prisma.billingRecord.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.user.deleteMany({
    where: { email: { startsWith: MARKER } },
  });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
});

describe("outcome events", () => {
  it("emits one shortlist for admin and interviewer and ignores a repeat", async () => {
    const adminWorld = await world("admin-short");
    const interviewerWorld = await world("int-short");

    const adminResult = await prisma.$transaction((tx) =>
      commitApplicationStatusChange(tx, {
        applicationId: adminWorld.application.id,
        expectedStatus: ApplicationPipelineStatus.TECH_EVALUATION,
        nextStatus: ApplicationPipelineStatus.SHORTLISTED,
        actorUserId: adminWorld.user.id,
        actorType: OutcomeEventActorType.ADMIN,
      }),
    );
    expect(adminResult?.status).toBe(ApplicationPipelineStatus.SHORTLISTED);

    const again = await prisma.$transaction((tx) =>
      commitApplicationStatusChange(tx, {
        applicationId: adminWorld.application.id,
        expectedStatus: ApplicationPipelineStatus.TECH_EVALUATION,
        nextStatus: ApplicationPipelineStatus.SHORTLISTED,
        actorUserId: adminWorld.user.id,
        actorType: OutcomeEventActorType.ADMIN,
      }),
    );
    expect(again).toBeNull();

    await prisma.$transaction((tx) =>
      commitApplicationStatusChange(tx, {
        applicationId: interviewerWorld.application.id,
        expectedStatus: ApplicationPipelineStatus.TECH_EVALUATION,
        nextStatus: ApplicationPipelineStatus.SHORTLISTED,
        actorUserId: interviewerWorld.user.id,
        actorType: OutcomeEventActorType.INTERVIEWER,
      }),
    );

    const events = await prisma.outcomeEvent.findMany({
      where: {
        applicationId: { in: [adminWorld.application.id, interviewerWorld.application.id] },
      },
    });
    expect(events).toHaveLength(2);
    const adminEvent = events.find((event) => event.applicationId === adminWorld.application.id);
    expect(adminEvent?.companyId).toBe(adminWorld.company.id);
    expect(adminEvent?.jobId).toBe(adminWorld.job.id);
    expect(adminEvent?.actorType).toBe(OutcomeEventActorType.ADMIN);
    expect(adminEvent?.actorUserId).toBe(adminWorld.user.id);
    expect(adminEvent?.fromStatus).toBe(ApplicationPipelineStatus.TECH_EVALUATION);
    expect(adminEvent?.toStatus).toBe(ApplicationPipelineStatus.SHORTLISTED);
  });

  it("emits rejection without copying the reason, including one event per bulk success", async () => {
    const first = await world("rej-a");
    const second = await world("rej-b");
    const interviewer = await world("rej-i");
    const loser = await world("rej-lost");

    for (const row of [first, second]) {
      await prisma.$transaction((tx) =>
        commitApplicationStatusChange(tx, {
          applicationId: row.application.id,
          expectedStatus: ApplicationPipelineStatus.TECH_EVALUATION,
          nextStatus: ApplicationPipelineStatus.REJECTED,
          actorUserId: row.user.id,
          actorType: OutcomeEventActorType.ADMIN,
          patch: { rejectionReason: "capacity" },
        }),
      );
    }
    await prisma.$transaction((tx) =>
      commitApplicationStatusChange(tx, {
        applicationId: interviewer.application.id,
        expectedStatus: ApplicationPipelineStatus.TECH_EVALUATION,
        nextStatus: ApplicationPipelineStatus.REJECTED,
        actorUserId: interviewer.user.id,
        actorType: OutcomeEventActorType.INTERVIEWER,
      }),
    );
    const lost = await prisma.$transaction((tx) =>
      commitApplicationStatusChange(tx, {
        applicationId: loser.application.id,
        expectedStatus: ApplicationPipelineStatus.CV_POOL,
        nextStatus: ApplicationPipelineStatus.REJECTED,
        actorUserId: loser.user.id,
        actorType: OutcomeEventActorType.ADMIN,
      }),
    );
    expect(lost).toBeNull();

    const events = await prisma.outcomeEvent.findMany({
      where: {
        applicationId: {
          in: [first.application.id, second.application.id, interviewer.application.id, loser.application.id],
        },
      },
    });
    expect(events).toHaveLength(3);
    expect(JSON.stringify(events)).not.toContain("capacity");
    expect(JSON.stringify(events)).not.toContain("keep me off the event");
    expect(events.every((event) => event.actorType === OutcomeEventActorType.ADMIN || event.actorType === OutcomeEventActorType.INTERVIEWER)).toBe(true);
  });

  it("emits client selection and hire once, keeps candidate status, and rolls back together", async () => {
    const selected = await world("select");
    await prisma.application.update({
      where: { id: selected.application.id },
      data: { status: ApplicationPipelineStatus.SHORTLISTED, shortlistedAt: new Date() },
    });
    const won = await prisma.$transaction((tx) =>
      commitApplicationStatusChange(tx, {
        applicationId: selected.application.id,
        expectedStatus: ApplicationPipelineStatus.SHORTLISTED,
        nextStatus: ApplicationPipelineStatus.SELECTED,
        actorUserId: selected.user.id,
        actorType: OutcomeEventActorType.CLIENT,
      }),
    );
    const lost = await prisma.$transaction((tx) =>
      commitApplicationStatusChange(tx, {
        applicationId: selected.application.id,
        expectedStatus: ApplicationPipelineStatus.SHORTLISTED,
        nextStatus: ApplicationPipelineStatus.SELECTED,
        actorUserId: selected.user.id,
        actorType: OutcomeEventActorType.CLIENT,
      }),
    );
    expect(won?.status).toBe(ApplicationPipelineStatus.SELECTED);
    expect(lost).toBeNull();

    const hired = await world("hire");
    await prisma.application.update({
      where: { id: hired.application.id },
      data: { status: ApplicationPipelineStatus.SELECTED },
    });
    await prisma.$transaction(async (tx) => {
      const updated = await commitApplicationStatusChange(tx, {
        applicationId: hired.application.id,
        expectedStatus: ApplicationPipelineStatus.SELECTED,
        nextStatus: ApplicationPipelineStatus.HIRED,
        actorUserId: hired.user.id,
        actorType: OutcomeEventActorType.CLIENT,
      });
      expect(updated).not.toBeNull();
      await generateBillingForHiredApplication(tx, hired.application.id);
    });
    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { id: hired.candidate.id },
    });
    expect(candidate.status).toBe(CandidateStatus.APPLIED);
    const hireEvents = await prisma.outcomeEvent.count({
      where: { applicationId: hired.application.id, eventType: OutcomeEventType.HIRED },
    });
    expect(hireEvents).toBe(1);
    const line = await prisma.billingLineItem.findFirst({
      where: { applicationId: hired.application.id },
    });
    expect(line).not.toBeNull();
  });

  it("emits offer accept once and a new decline after remint without deleting the first", async () => {
    const accepted = await world("accept");
    const now = new Date();
    const first = await prisma.$transaction((tx) =>
      commitOfferDecision(tx, {
        applicationId: accepted.application.id,
        decision: "ACCEPTED",
        occurredAt: now,
      }),
    );
    const retry = await prisma.$transaction((tx) =>
      commitOfferDecision(tx, {
        applicationId: accepted.application.id,
        decision: "ACCEPTED",
        occurredAt: new Date(),
      }),
    );
    expect(first).toBe(1);
    expect(retry).toBe(0);
    const acceptEvents = await prisma.outcomeEvent.findMany({
      where: { applicationId: accepted.application.id },
    });
    expect(acceptEvents).toHaveLength(1);
    expect(acceptEvents[0]?.actorUserId).toBeNull();
    expect(acceptEvents[0]?.actorType).toBe(OutcomeEventActorType.PUBLIC_TOKEN);
    expect(acceptEvents[0]?.fromStatus).toBeNull();
    const status = await prisma.application.findUniqueOrThrow({
      where: { id: accepted.application.id },
    });
    expect(status.status).toBe(ApplicationPipelineStatus.TECH_EVALUATION);

    const declined = await world("decline");
    await prisma.$transaction((tx) =>
      commitOfferDecision(tx, {
        applicationId: declined.application.id,
        decision: "DECLINED",
        occurredAt: new Date(),
      }),
    );
    await prisma.$transaction((tx) =>
      commitOfferDecision(tx, {
        applicationId: declined.application.id,
        decision: "DECLINED",
        occurredAt: new Date(),
      }),
    );
    await prisma.application.update({
      where: { id: declined.application.id },
      data: { offerDeclinedAt: null, offerMintedAt: new Date() },
    });
    const remaining = await prisma.outcomeEvent.count({
      where: { applicationId: declined.application.id, eventType: OutcomeEventType.OFFER_DECLINED },
    });
    expect(remaining).toBe(1);
    await prisma.$transaction((tx) =>
      commitOfferDecision(tx, {
        applicationId: declined.application.id,
        decision: "DECLINED",
        occurredAt: new Date(),
      }),
    );
    expect(
      await prisma.outcomeEvent.count({
        where: { applicationId: declined.application.id, eventType: OutcomeEventType.OFFER_DECLINED },
      }),
    ).toBe(2);
  });

  it("lets only one concurrent admin transition emit", async () => {
    const row = await world("race");
    const results = await Promise.all([
      prisma.$transaction((tx) =>
        commitApplicationStatusChange(tx, {
          applicationId: row.application.id,
          expectedStatus: ApplicationPipelineStatus.TECH_EVALUATION,
          nextStatus: ApplicationPipelineStatus.REJECTED,
          actorUserId: row.user.id,
          actorType: OutcomeEventActorType.ADMIN,
        }),
      ),
      prisma.$transaction((tx) =>
        commitApplicationStatusChange(tx, {
          applicationId: row.application.id,
          expectedStatus: ApplicationPipelineStatus.TECH_EVALUATION,
          nextStatus: ApplicationPipelineStatus.REJECTED,
          actorUserId: row.user.id,
          actorType: OutcomeEventActorType.ADMIN,
        }),
      ),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      await prisma.outcomeEvent.count({ where: { applicationId: row.application.id } }),
    ).toBe(1);
  });

  it("does not backfill and does not store sensitive columns", () => {
    const migration = readFileSync(
      join(process.cwd(), "prisma/migrations/20261007180000_outcome_event/migration.sql"),
      "utf8",
    );
    expect(migration).not.toMatch(/INSERT INTO "OutcomeEvent"/);
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const model = schema.slice(schema.indexOf("model OutcomeEvent"), schema.indexOf("enum EvidenceGraphNodeType"));
    for (const forbidden of [
      "rejectionReason",
      "offerTerms",
      "offerCompensation",
      "proposedStartDate",
      "humanRelevance",
      "notes",
      "recordingUrl",
    ]) {
      expect(model).not.toContain(forbidden);
    }
    const sources = [
      "app/actions/application-actions.ts",
      "lib/offers/offer-acceptance.ts",
      "lib/outcomes/outcome-event-writes.ts",
    ]
      .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
      .join("\n");
    expect(sources).not.toContain("outcomeEvent.update");
    expect(sources).not.toContain("outcomeEvent.delete");
  });
});
