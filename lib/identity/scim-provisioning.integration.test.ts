import "@/lib/evidence-graph/evidence-graph-test-env";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, PortalRole } from "@prisma/client";
import { DELETE, GET, PATCH, POST } from "@/app/api/scim/v2/[[...path]]/route";
import { cancelCloseOut } from "@/lib/screening/close-out-service";
import { deleteAuditLogsForTests } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { gateIntegrationSuite } from "@/lib/testing/integration-database-gate";

const integrationDatabase = gateIntegrationSuite();

const failure = vi.hoisted(() => ({ action: null as string | null }));

// Wraps the real writer so a test can make one action's audit write fail. Everything else passes straight through.
vi.mock("@/lib/audit/write-audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/write-audit-log")>();
  return {
    ...actual,
    writeAuditLog: async (db: Parameters<typeof actual.writeAuditLog>[0], input: Parameters<typeof actual.writeAuditLog>[1]) => {
      if (failure.action && input.action === failure.action) throw new Error("simulated audit persistence failure");
      return actual.writeAuditLog(db, input);
    },
  };
});






const MARKER = `scimprov-${process.pid}-${Date.now()}`;
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

type Tenant = { companyId: number; adminId: number; jobId: number; tokenId: number; token: string };

describe.skipIf(integrationDatabase.mode === "skip")("SCIM provisioning across tenants", () => {
  const tenants = {} as Record<"a" | "b", Tenant>;
  const companyIds: number[] = [];
  let seq = 0;

  async function tenant(label: string): Promise<Tenant> {
    const company = await prisma.company.create({ data: { name: `${MARKER}-${label}`, industry: "T", employees: 2, publicSlug: `${MARKER}-${label}` } });
    companyIds.push(company.id);
    const admin = await prisma.user.create({
      data: { email: `${MARKER}-${label}-admin@hireiq.test`, name: `admin ${label}`, role: PortalRole.ADMIN, passwordHash: "x", emailVerifiedAt: new Date(), companyId: company.id },
    });
    const job = await prisma.job.create({ data: { title: `${MARKER}-${label}`, status: JobStatus.OPEN, companyId: company.id } });
    const { id: tokenId, token } = await credential(company.id, label);
    return { companyId: company.id, adminId: admin.id, jobId: job.id, tokenId, token };
  }

  async function credential(companyId: number, label: string) {
    const token = `scim-${MARKER}-${label}-${randomUUID()}`;
    const row = await prisma.scimToken.create({ data: { companyId, tokenHash: sha256(token) } });
    return { id: row.id, token };
  }

  const call = (handler: typeof POST, token: string | null, path: string[], body?: unknown, method = "POST", query = "") =>
    handler(
      new Request(`http://localhost:4001/api/scim/v2/${path.join("/")}${query}`, {
        method,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve({ path }) },
    );
  const userBody = (label: string, over: Record<string, unknown> = {}) => ({
    userName: `${label}-${MARKER}@scim.test`, name: { givenName: "S", familyName: "P" }, externalId: `ext-${label}-${MARKER}`, active: true, ...over,
  });
  const create = async (t: Tenant, label: string, over: Record<string, unknown> = {}) => {
    const res = await call(POST, t.token, ["Users"], userBody(label, over));
    expect(res.status).toBe(201);
    return Number(((await res.json()) as { id: string }).id);
  };
  const audits = (where: object) => prisma.auditLog.findMany({ where: { companyId: { in: companyIds }, ...where }, orderBy: { id: "asc" } });
  const member = (t: Tenant, label: string) =>
    prisma.user.create({ data: { email: `${MARKER}-${label}-${++seq}@hireiq.test`, name: label, role: PortalRole.INTERVIEWER, passwordHash: "x", emailVerifiedAt: new Date(), companyId: t.companyId } });

  beforeAll(async () => {
    tenants.a = await tenant("a");
    tenants.b = await tenant("b");
  });

  beforeEach(() => {
    failure.action = null;
  });

  afterAll(async () => {
    const where = { companyId: { in: companyIds } };
    await deleteAuditLogsForTests(where);
    await prisma.scimDirectoryGroup.deleteMany({ where });
    await prisma.scimDirectoryUser.deleteMany({ where });
    await prisma.apiToken.deleteMany({ where });
    await prisma.closeOutBatch.deleteMany({ where });
    await prisma.scimToken.deleteMany({ where });
    await prisma.application.deleteMany({ where });
    await prisma.job.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });

  describe("id allocation", () => {
    it("lets two companies provision their first users, with distinct global ids and independent mappings", async () => {
      const { a, b } = tenants;
      // Same userName and externalId in both companies is legal: uniqueness is per company.
      const idA = await create(a, "shared", { externalId: "same-external-id" });
      const idB = await create(b, "shared", { externalId: "same-external-id" });
      expect(idA).not.toBe(idB);
      const rowA = await prisma.scimDirectoryUser.findUniqueOrThrow({ where: { id: idA } });
      const rowB = await prisma.scimDirectoryUser.findUniqueOrThrow({ where: { id: idB } });
      expect(rowA).toMatchObject({ companyId: a.companyId, userName: `shared-${MARKER}@scim.test`, externalId: "same-external-id" });
      expect(rowB).toMatchObject({ companyId: b.companyId, userName: `shared-${MARKER}@scim.test`, externalId: "same-external-id" });
      // Each credential lists only its own directory.
      const listA = (await (await call(GET, a.token, ["Users"], undefined, "GET")).json()) as { Resources: Array<{ id: string }> };
      expect(listA.Resources.map((row) => row.id)).toContain(String(idA));
      expect(listA.Resources.map((row) => row.id)).not.toContain(String(idB));
    });

    it("does not target another tenant's row when a reserved id is already taken, and never overwrites it", async () => {
      const { a, b } = tenants;
      // Reproduces the old failure shape: a row sits exactly where the sequence will hand out its next id.
      const [{ id: peek }] = await prisma.$queryRaw<Array<{ id: bigint }>>`SELECT last_value + 1 AS id FROM "ScimDirectoryUser_id_seq"`;
      const squatted = await prisma.scimDirectoryUser.create({ data: { id: Number(peek), companyId: a.companyId, userName: `squatter-${MARKER}@scim.test`, externalId: "keep-me", active: true } });
      const idB = await create(b, "after-squat");
      expect(idB).not.toBe(squatted.id);
      const kept = await prisma.scimDirectoryUser.findUniqueOrThrow({ where: { id: squatted.id } });
      expect(kept).toMatchObject({ companyId: a.companyId, userName: `squatter-${MARKER}@scim.test`, externalId: "keep-me", active: true });
      expect((await prisma.scimDirectoryUser.findUniqueOrThrow({ where: { id: idB } })).companyId).toBe(b.companyId);
    });

    it("allocates group ids globally too", async () => {
      const { a, b } = tenants;
      const ga = await call(POST, a.token, ["Groups"], { displayName: `g-a-${MARKER}` });
      const gb = await call(POST, b.token, ["Groups"], { displayName: `g-b-${MARKER}` });
      expect([ga.status, gb.status]).toEqual([201, 201]);
      const idA = Number(((await ga.json()) as { id: string }).id);
      const idB = Number(((await gb.json()) as { id: string }).id);
      expect(idA).not.toBe(idB);
      expect((await prisma.scimDirectoryGroup.findUniqueOrThrow({ where: { id: idA } })).companyId).toBe(a.companyId);
      expect((await prisma.scimDirectoryGroup.findUniqueOrThrow({ where: { id: idB } })).companyId).toBe(b.companyId);
    });
  });

  describe("repeated provisioning", () => {
    it("treats the same userName as the same identity: 409, one directory row, one audit row, no second id", async () => {
      const { a } = tenants;
      const id = await create(a, "idem");
      const again = await call(POST, a.token, ["Users"], userBody("idem"));
      expect(again.status).toBe(409);
      expect(await prisma.scimDirectoryUser.count({ where: { companyId: a.companyId, userName: `idem-${MARKER}@scim.test` } })).toBe(1);
      expect(await audits({ action: "SCIM_USER_CREATED", targetId: id })).toHaveLength(1);
    });

    it("resolves two concurrent creates of one userName to a single user", async () => {
      const { b } = tenants;
      const body = userBody("race");
      const results = await Promise.all([call(POST, b.token, ["Users"], body), call(POST, b.token, ["Users"], body)]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      const rows = await prisma.scimDirectoryUser.findMany({ where: { companyId: b.companyId, userName: body.userName } });
      expect(rows).toHaveLength(1);
      expect(await audits({ action: "SCIM_USER_CREATED", targetId: rows[0]!.id })).toHaveLength(1);
    });
  });

  describe("deprovisioning audit targets", () => {
    it("names the correct persisted User for a linked entry, and not an earlier inactive entry's user", async () => {
      const { a } = tenants;
      const earlier = await member(a, "earlier");
      const target = await member(a, "target");
      // An earlier, already-inactive entry linked to a different user: it must not be the one that gets disabled.
      await prisma.scimDirectoryUser.create({ data: { companyId: a.companyId, userName: `old-${MARKER}@scim.test`, active: false, portalUserId: earlier.id } });
      const entry = await prisma.scimDirectoryUser.create({ data: { companyId: a.companyId, userName: `linked-${MARKER}@scim.test`, active: true, portalUserId: target.id } });
      const res = await call(DELETE, a.token, ["Users", String(entry.id)], undefined, "DELETE");
      expect(res.status).toBe(204);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).disabledAt).not.toBeNull();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: earlier.id } })).disabledAt).toBeNull();
      const rows = await audits({ action: "SCIM_USER_DEPROVISIONED", targetType: "User", targetId: target.id });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorRole: "SCIM", actorUserId: null, companyId: a.companyId });
      expect(await audits({ action: "SCIM_USER_DEPROVISIONED", targetId: earlier.id })).toHaveLength(0);
    });

    it("names the directory entry, never a User, when the entry is not linked (even if its id equals a real user's id)", async () => {
      const { a } = tenants;
      const bystander = await member(a, "bystander");
      // The directory entry's id is deliberately the same number as a real User's id.
      const entry = await prisma.scimDirectoryUser.create({ data: { id: bystander.id + 1_000_000, companyId: a.companyId, userName: `unlinked-${MARKER}@scim.test`, active: true } });
      const sameNumberUser = await prisma.user.create({
        data: { id: entry.id, email: `${MARKER}-twin@hireiq.test`, name: "twin", role: PortalRole.INTERVIEWER, passwordHash: "x", emailVerifiedAt: new Date(), companyId: a.companyId },
      });
      const res = await call(DELETE, a.token, ["Users", String(entry.id)], undefined, "DELETE");
      expect(res.status).toBe(204);
      expect(await audits({ action: "SCIM_USER_DEPROVISIONED", targetType: "User", targetId: entry.id })).toHaveLength(0);
      const rows = await audits({ action: "SCIM_USER_DEPROVISIONED", targetType: "ScimDirectoryUser", targetId: entry.id });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorRole: "SCIM", actorUserId: null, companyId: a.companyId });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: sameNumberUser.id } })).disabledAt).toBeNull();
      expect((await prisma.scimDirectoryUser.findUniqueOrThrow({ where: { id: entry.id } })).active).toBe(false);
    });

    it("also applies to a PATCH deactivation", async () => {
      const { a } = tenants;
      const id = await create(a, "patch-off");
      const res = await call(PATCH, a.token, ["Users", String(id)], { Operations: [{ op: "replace", path: "active", value: false }] }, "PATCH");
      expect(res.status).toBe(200);
      expect(await audits({ action: "SCIM_USER_DEPROVISIONED", targetType: "ScimDirectoryUser", targetId: id })).toHaveLength(1);
      expect(await audits({ action: "SCIM_USER_DEPROVISIONED", targetType: "User", targetId: id })).toHaveLength(0);
    });

    it("never disables a user of another company through a link, and names the entry instead", async () => {
      const { a, b } = tenants;
      const foreign = await member(b, "foreign");
      const entry = await prisma.scimDirectoryUser.create({ data: { companyId: a.companyId, userName: `crosslink-${MARKER}@scim.test`, active: true, portalUserId: foreign.id } });
      const res = await call(DELETE, a.token, ["Users", String(entry.id)], undefined, "DELETE");
      expect(res.status).toBe(204);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: foreign.id } })).disabledAt).toBeNull();
      expect(await audits({ action: "SCIM_USER_DEPROVISIONED", targetId: foreign.id })).toHaveLength(0);
      const rows = await audits({ action: "SCIM_USER_DEPROVISIONED", targetType: "ScimDirectoryUser", targetId: entry.id });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.companyId).toBe(a.companyId);
    });
  });

  describe("transactions", () => {
    it("rolls a failed provisioning audit back, and the retry succeeds", async () => {
      const { a } = tenants;
      const body = userBody("rb-create");
      failure.action = "SCIM_USER_CREATED";
      const failed = await call(POST, a.token, ["Users"], body);
      expect(failed.status).toBe(500);
      expect(await prisma.scimDirectoryUser.count({ where: { companyId: a.companyId, userName: body.userName } })).toBe(0);
      failure.action = null;
      const retry = await call(POST, a.token, ["Users"], body);
      expect(retry.status).toBe(201);
      expect(await audits({ action: "SCIM_USER_CREATED", targetId: Number(((await retry.json()) as { id: string }).id) })).toHaveLength(1);
    });

    it("rolls a failed deprovision audit back: the entry stays active, the linked user stays enabled", async () => {
      const { a } = tenants;
      const linked = await member(a, "rb-linked");
      const entry = await prisma.scimDirectoryUser.create({ data: { companyId: a.companyId, userName: `rb-off-${MARKER}@scim.test`, active: true, portalUserId: linked.id } });
      failure.action = "SCIM_USER_DEPROVISIONED";
      const failed = await call(DELETE, a.token, ["Users", String(entry.id)], undefined, "DELETE");
      expect(failed.status).toBe(500);
      expect((await prisma.scimDirectoryUser.findUniqueOrThrow({ where: { id: entry.id } })).active).toBe(true);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: linked.id } })).disabledAt).toBeNull();
      expect(await audits({ action: "SCIM_USER_DEPROVISIONED", targetId: linked.id })).toHaveLength(0);
      failure.action = null;
      expect((await call(DELETE, a.token, ["Users", String(entry.id)], undefined, "DELETE")).status).toBe(204);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: linked.id } })).disabledAt).not.toBeNull();
    });
  });

  describe("tenant isolation", () => {
    it("a company's credential cannot read or mutate another company's users", async () => {
      const { a, b } = tenants;
      const idB = await create(b, "isolated");
      const auditsBefore = await prisma.auditLog.count({ where: { companyId: { in: companyIds } } });
      expect((await call(GET, a.token, ["Users", String(idB)], undefined, "GET")).status).toBe(404);
      expect((await call(PATCH, a.token, ["Users", String(idB)], { Operations: [{ op: "replace", path: "active", value: false }] }, "PATCH")).status).toBe(404);
      expect((await call(DELETE, a.token, ["Users", String(idB)], undefined, "DELETE")).status).toBe(404);
      const filtered = (await (await call(GET, a.token, ["Users"], undefined, "GET", `?filter=${encodeURIComponent(`userName eq "isolated-${MARKER}@scim.test"`)}`)).json()) as { totalResults: number };
      expect(filtered.totalResults).toBe(0);
      expect((await prisma.scimDirectoryUser.findUniqueOrThrow({ where: { id: idB } })).active).toBe(true);
      expect(await prisma.auditLog.count({ where: { companyId: { in: companyIds } } })).toBe(auditsBefore);
    });

    it("missing, unknown and revoked credentials are refused and write nothing", async () => {
      const { a } = tenants;
      const revoked = await credential(a.companyId, "revoked");
      await prisma.scimToken.update({ where: { id: revoked.id }, data: { revokedAt: new Date() } });
      const usersBefore = await prisma.scimDirectoryUser.count({ where: { companyId: { in: companyIds } } });
      const auditsBefore = await prisma.auditLog.count({ where: { companyId: { in: companyIds } } });
      for (const token of [null, "not-a-scim-token", revoked.token]) {
        expect((await call(POST, token, ["Users"], userBody("refused"))).status).toBe(401);
      }
      expect(await prisma.scimDirectoryUser.count({ where: { companyId: { in: companyIds } } })).toBe(usersBefore);
      expect(await prisma.auditLog.count({ where: { companyId: { in: companyIds } } })).toBe(auditsBefore);
    });
  });

  describe("credential attribution", () => {
    it("records which credential acted, per company and per credential, and never the secret or its hash", async () => {
      const { a, b } = tenants;
      const second = await credential(a.companyId, "a2");
      const idA1 = await create(a, "cred-1");
      const resA2 = await call(POST, second.token, ["Users"], userBody("cred-2"));
      const idA2 = Number(((await resA2.json()) as { id: string }).id);
      const idB = await create(b, "cred-b");

      const rowA1 = (await audits({ action: "SCIM_USER_CREATED", targetId: idA1 }))[0]!;
      const rowA2 = (await audits({ action: "SCIM_USER_CREATED", targetId: idA2 }))[0]!;
      const rowB = (await audits({ action: "SCIM_USER_CREATED", targetId: idB }))[0]!;
      expect(rowA1).toMatchObject({ actorRole: "SCIM", actorUserId: null, companyId: a.companyId, scimTokenId: a.tokenId });
      expect(rowA2).toMatchObject({ actorRole: "SCIM", actorUserId: null, companyId: a.companyId, scimTokenId: second.id });
      expect(rowB).toMatchObject({ actorRole: "SCIM", actorUserId: null, companyId: b.companyId, scimTokenId: b.tokenId });
      // The credential belongs to the company on the row.
      for (const row of [rowA1, rowA2, rowB]) {
        const token = await prisma.scimToken.findUniqueOrThrow({ where: { id: row.scimTokenId! } });
        expect(token.companyId).toBe(row.companyId);
      }
      const serialized = JSON.stringify([rowA1, rowA2, rowB]);
      for (const secret of [a.token, second.token, b.token, sha256(a.token), sha256(second.token), sha256(b.token)]) expect(serialized).not.toContain(secret);
    });

    it("the database refuses a SCIM row with no credential, and a credential on any other role", async () => {
      const { a } = tenants;
      const base = { companyId: a.companyId, action: "X", targetType: "ScimDirectoryUser", targetId: 1 };
      await expect(prisma.auditLog.create({ data: { ...base, actorRole: "SCIM", actorUserId: null } })).rejects.toThrow();
      await expect(prisma.auditLog.create({ data: { ...base, actorRole: "ADMIN", actorUserId: a.adminId, scimTokenId: a.tokenId } })).rejects.toThrow();
      expect(await prisma.auditLog.count({ where: { companyId: a.companyId, action: "X" } })).toBe(0);
    });
  });

  it("admin attribution is unchanged: an admin action records that admin with role ADMIN and no credential", async () => {
    const { a } = tenants;
    const app = await prisma.candidate.create({ data: { name: `cand-${MARKER}`, role: "Eng", experienceYears: 1, status: "APPLIED", companyId: a.companyId } });
    const application = await prisma.application.create({ data: { candidateId: app.id, jobId: a.jobId, companyId: a.companyId, aiPreference: "ALLOWED" } });
    const batch = await prisma.closeOutBatch.create({
      data: { companyId: a.companyId, jobId: a.jobId, category: "SELECTED", reason: "Location mismatch", applicationIds: [application.id], proposedByUserId: a.adminId },
    });
    expect(await cancelCloseOut({ batchId: batch.id, companyId: a.companyId, actorUserId: a.adminId })).toEqual({ ok: true });
    const rows = await audits({ action: "CLOSE_OUT_CANCELLED", targetId: batch.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorRole: "ADMIN", actorUserId: a.adminId, companyId: a.companyId, scimTokenId: null });
    await prisma.application.deleteMany({ where: { id: application.id } });
    await prisma.candidate.deleteMany({ where: { id: app.id } });
  });
});
