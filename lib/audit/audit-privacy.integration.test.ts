import "@/lib/evidence-graph/evidence-graph-test-env";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CandidateStatus, JobStatus, PortalRole } from "@prisma/client";
import { generateAssessmentFromRubric } from "@/lib/assessments/generated-assessment";
import { overrideAssessmentGrade } from "@/lib/assessments/generated-assessment-service";
import { deleteAuditLogsForTests, maskEmailAddresses, writeAuditLog } from "@/lib/audit/write-audit-log";
import { hashSecureToken } from "@/lib/auth/secure-token";
import {
  queueDeletion,
  rememberPortalIdentity,
  requestPortalHumanReview,
  setFutureRolesConsent,
  setOptOut,
  unsubscribeApplication,
  withdrawApplication,
} from "@/lib/portal/portal-service";
import { prisma } from "@/lib/prisma";
import { eraseCandidate } from "@/lib/privacy/candidate-erasure";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const MARKER = `audpriv-${process.pid}-${Date.now()}`;
const EMAIL = `${MARKER}@candidate.test`;
const WITHDRAW_TEXT = `moved to another city ${MARKER}-private`;
const OVERRIDE_TEXT = `answer quoted ${MARKER}-quote`;

describe.skipIf(integrationDatabase.mode === "skip")("audit rows carry no personal content", () => {
  let companyId = 0;
  let adminId = 0;
  let candidateId = 0;
  let applicationId = 0;
  let jobId = 0;

  const rowsFor = (action: string, targetId: number) => prisma.auditLog.findMany({ where: { companyId, action, targetId } });

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: MARKER, industry: "T", employees: 2, publicSlug: MARKER } });
    companyId = company.id;
    adminId = (await prisma.user.create({ data: { email: `${MARKER}-admin@hireiq.test`, name: "a", role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId } })).id;
    jobId = (await prisma.job.create({ data: { title: MARKER, status: JobStatus.OPEN, companyId } })).id;
    const candidate = await prisma.candidate.create({ data: { name: MARKER, role: "Eng", experienceYears: 1, status: CandidateStatus.APPLIED, companyId } });
    candidateId = candidate.id;
    applicationId = (await prisma.application.create({ data: { candidateId, jobId, companyId, aiPreference: "ALLOWED" } })).id;
    await rememberPortalIdentity(EMAIL, candidateId, companyId);
  });

  afterAll(async () => {
    const where = { companyId };
    await deleteAuditLogsForTests(where);
    await prisma.candidateDeletionRequest.deleteMany({ where });
    await prisma.candidatePortalIdentity.deleteMany({ where });
    await prisma.candidateErasure.deleteMany({ where });
    await prisma.generatedAssessmentInvite.deleteMany({ where: { assessment: where } });
    await prisma.generatedAssessment.deleteMany({ where });
    await prisma.aIRun.deleteMany({ where });
    await prisma.application.deleteMany({ where });
    await prisma.candidate.deleteMany({ where });
    await prisma.job.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  it("masks email addresses before they are stored, even if a caller passes one", async () => {
    expect(maskEmailAddresses(`from ${EMAIL} and Other.Person+tag@Example.co.uk done`)).toBe("from [email] and [email] done");
    await writeAuditLog(prisma, { actorUserId: adminId, actorRole: "ADMIN", companyId, action: "TEST_MASK", targetType: "APPLICATION", targetId: applicationId, reason: `contacted ${EMAIL}` });
    const [row] = await rowsFor("TEST_MASK", applicationId);
    expect(row?.reason).toBe("contacted [email]");
  });

  it("every candidate-portal action records actor role, tenant, action, target and time, and no address", async () => {
    await setOptOut(applicationId, EMAIL, true);
    await setFutureRolesConsent(applicationId, EMAIL, true);
    await requestPortalHumanReview(applicationId, EMAIL);
    await withdrawApplication(applicationId, EMAIL, `${WITHDRAW_TEXT} reach me at ${EMAIL}`);
    await unsubscribeApplication(applicationId, EMAIL);
    await queueDeletion(applicationId, EMAIL);

    const rows = await prisma.auditLog.findMany({
      where: { companyId, OR: [{ targetId: applicationId, targetType: "APPLICATION" }, { targetId: candidateId, targetType: "CANDIDATE" }], actorRole: "CANDIDATE" },
    });
    const actions = rows.map((row) => row.action).sort();
    expect(actions).toEqual(expect.arrayContaining(["AI_OPT_OUT", "FUTURE_ROLES_CONSENT", "HUMAN_REVIEW_REQUESTED", "APPLICATION_WITHDRAWN", "EMAIL_UNSUBSCRIBED", "DELETION_REQUESTED"]));
    for (const row of rows) {
      expect(row.companyId).toBe(companyId);
      expect(row.occurredAt).toBeInstanceOf(Date);
      // A candidate is not a user, so no administrator is named.
      expect(row.actorUserId).toBeNull();
      expect(row.reason ?? "").toMatch(/^via candidate portal/);
      expect(JSON.stringify(row)).not.toContain("@");
      expect(JSON.stringify(row)).not.toContain(MARKER + "@");
      expect(JSON.stringify(row)).not.toContain("private");
    }
    expect((await rowsFor("APPLICATION_WITHDRAWN", applicationId))[0]?.reason).toBe("via candidate portal | reason given");
    // The candidate's own words stay where erasure can clear them.
    expect((await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })).withdrawReason).toContain("private");
  });

  it("a grade override keeps the item and scores in the log, keeps the reviewer's reason on the grade, and erasure clears it", async () => {
    const items = generateAssessmentFromRubric({ requirements: ["SQL", "APIs", "Testing", "Debugging"], rubric: [] }) as Array<{ id: string; type: string }>;
    const assessment = await prisma.generatedAssessment.create({ data: { jobId, companyId, version: 1, status: "PUBLISHED", publishedAt: new Date(), items } });
    const target = items.find((item) => item.type !== "multiple_choice")!;
    const invite = await prisma.generatedAssessmentInvite.create({
      data: {
        applicationId,
        assessmentId: assessment.id,
        tokenHash: hashSecureToken(`${MARKER}-grade-token-abcdef`),
        itemOrder: items.map((item) => item.id),
        answers: {},
        expiresAt: new Date(Date.now() + 86_400_000),
        gradedAt: new Date(),
        grades: items.map((item) => ({ itemId: item.id, requirement: "x", max: 5, score: 2, needsHuman: false, quote: null })),
      },
    });
    await overrideAssessmentGrade({ inviteId: invite.id, companyId, actorUserId: adminId, itemId: target.id, score: 4, reason: OVERRIDE_TEXT });
    const [row] = await rowsFor("ASSESSMENT_GRADE_OVERRIDDEN", invite.id);
    expect(row?.reason).toBe(`${target.id}: 2 -> 4 | reason recorded on the grade`);
    expect(JSON.stringify(row)).not.toContain(MARKER);
    const graded = (await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: invite.id } })).grades as Array<{ overrideReason?: string | null }>;
    expect(JSON.stringify(graded)).toContain(OVERRIDE_TEXT);

    await eraseCandidate({ companyId, candidateId, trigger: "ADMIN_REQUEST", deps: { deleteObject: async () => ({ status: "ABSENT" }) } });
    const after = (await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: invite.id } })).grades as Array<{ score: number; overrideReason?: string | null }>;
    expect(JSON.stringify(after)).not.toContain(OVERRIDE_TEXT);
    expect(after.find((entry) => entry.score === 4)).toBeDefined();
  });

  it("the portal service source never passes an email address or free text as an audit reason", () => {
    const source = readFileSync("lib/portal/portal-service.ts", "utf8");
    const reasons = [...source.matchAll(/reason:\s*([^\n]+)/g)].map((match) => match[1]!);
    expect(reasons.length).toBeGreaterThan(5);
    for (const reason of reasons) expect(reason).not.toMatch(/email/i);
  });
});
