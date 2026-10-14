import "@/lib/evidence-graph/evidence-graph-test-env";

import { afterAll, describe, expect, it } from "vitest";
import { CandidateStatus, JobStatus } from "@prisma/client";

import { readFileSync } from "fs";
import { join } from "path";

import { commitOfferDecision } from "@/lib/outcomes/outcome-event-writes";
import { mintOfferForAuthorizedAdmin } from "@/lib/offers/offer-mint";
import { prisma } from "@/lib/prisma";

const MARKER = `offer-${process.pid}-${Date.now()}`;
const companyIds: number[] = [];

async function applicationIn(label: string, status: "SELECTED" | "HIRED" | "CV_POOL") {
  const company = await prisma.company.create({
    data: {
      name: `${MARKER} ${label}`,
      industry: "Test",
      employees: 1,
      publicSlug: `${MARKER}-${label}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    },
  });
  companyIds.push(company.id);
  const job = await prisma.job.create({
    data: { title: `${label} role`, status: JobStatus.OPEN, companyId: company.id },
  });
  const candidate = await prisma.candidate.create({
    data: {
      name: `${label} Candidate`,
      role: "Engineer",
      experienceYears: 1,
      status: CandidateStatus.APPLIED,
      companyId: company.id,
    },
  });
  const application = await prisma.application.create({
    data: {
      candidateId: candidate.id,
      jobId: job.id,
      companyId: company.id,
      status,
    },
  });
  return { company, application };
}

afterAll(async () => {
  if (companyIds.length === 0) return;
  await prisma.outcomeEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.application.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.candidate.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
});

describe("application-scoped offer mint", () => {
  it("mints for the application's company and ignores any other company", async () => {
    const companyA = await applicationIn("a", "SELECTED");
    const companyB = await applicationIn("b", "HIRED");

    const mintedA = await mintOfferForAuthorizedAdmin(companyA.application.id, {
      terms: "Probation 3 months",
      compensation: "As discussed",
    });
    const mintedB = await mintOfferForAuthorizedAdmin(companyB.application.id);

    expect(mintedA.ok).toBe(true);
    expect(mintedB.ok).toBe(true);
    if (!mintedA.ok || !mintedB.ok) return;
    expect(mintedA.companyId).toBe(companyA.company.id);
    expect(mintedA.applicationId).toBe(companyA.application.id);
    expect(mintedB.companyId).toBe(companyB.company.id);
    expect(mintedB.applicationId).toBe(companyB.application.id);

    const storedA = await prisma.application.findUniqueOrThrow({
      where: { id: companyA.application.id },
    });
    expect(storedA.companyId).toBe(companyA.company.id);
    expect(storedA.offerMintedAt).not.toBeNull();
    expect(storedA.offerAcceptanceTokenHash).not.toBeNull();
    expect(storedA.offerTerms).toBe("Probation 3 months");
  });

  it("rejects a missing application, an ineligible status, and an accepted offer", async () => {
    const missing = await mintOfferForAuthorizedAdmin(2_000_000_000);
    expect(missing).toEqual({ ok: false, error: "Application was not found." });

    const pooled = await applicationIn("pool", "CV_POOL");
    const ineligible = await mintOfferForAuthorizedAdmin(pooled.application.id);
    expect(ineligible.ok).toBe(false);

    const selected = await applicationIn("accepted", "SELECTED");
    await prisma.application.update({
      where: { id: selected.application.id },
      data: { offerAcceptedAt: new Date() },
    });
    const accepted = await mintOfferForAuthorizedAdmin(selected.application.id);
    expect(accepted).toEqual({
      ok: false,
      error: "This offer has already been accepted.",
    });
  });

  it("keeps pipeline status when the existing offer decision write runs", async () => {
    const accepted = await applicationIn("accept", "SELECTED");
    const declined = await applicationIn("decline", "HIRED");
    const mintedAccept = await mintOfferForAuthorizedAdmin(accepted.application.id);
    const mintedDecline = await mintOfferForAuthorizedAdmin(declined.application.id);
    expect(mintedAccept.ok).toBe(true);
    expect(mintedDecline.ok).toBe(true);

    await prisma.$transaction((tx) =>
      commitOfferDecision(tx, {
        applicationId: accepted.application.id,
        decision: "ACCEPTED",
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

    const acceptRow = await prisma.application.findUniqueOrThrow({
      where: { id: accepted.application.id },
    });
    const declineRow = await prisma.application.findUniqueOrThrow({
      where: { id: declined.application.id },
    });
    expect(acceptRow.companyId).toBe(accepted.company.id);
    expect(acceptRow.status).toBe("SELECTED");
    expect(acceptRow.offerAcceptedAt).not.toBeNull();
    expect(declineRow.companyId).toBe(declined.company.id);
    expect(declineRow.status).toBe("HIRED");
    expect(declineRow.offerDeclinedAt).not.toBeNull();
  });

  it("does not read the admin user company when authorizing a mint", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/offers/offer-acceptance.ts"),
      "utf8",
    );
    expect(source).not.toContain("admin.companyId");
    expect(source).toContain("await requireAdmin()");
    expect(source).toContain("export async function acceptOffer");
    expect(source).toContain("export async function declineOffer");
  });
});
