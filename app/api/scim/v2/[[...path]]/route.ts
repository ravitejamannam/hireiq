import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { applyScim, deprovisionEffect, emptyDirectory, userAuditTarget, type ScimState } from "@/lib/identity/scim";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** The credential's tenant and its row id. The id identifies the credential in the audit log; the secret never leaves here. */
async function credentialFromBearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return prisma.scimToken.findFirst({ where: { tokenHash, revokedAt: null }, select: { id: true, companyId: true } });
}

/**
 * Directory ids are the table's primary key, which is global, so they come from PostgreSQL, never from a
 * per-company counter. A reserved id is skipped if a row already holds it (a sequence that fell behind explicit
 * inserts), so one tenant's row is never targeted by another tenant's create.
 */
async function allocateDirectoryId(kind: "Users" | "Groups") {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rows =
      kind === "Users"
        ? await prisma.$queryRaw<Array<{ id: bigint }>>`SELECT nextval(pg_get_serial_sequence('"ScimDirectoryUser"', 'id')) AS id`
        : await prisma.$queryRaw<Array<{ id: bigint }>>`SELECT nextval(pg_get_serial_sequence('"ScimDirectoryGroup"', 'id')) AS id`;
    const id = Number(rows[0]!.id);
    const taken =
      kind === "Users"
        ? await prisma.scimDirectoryUser.count({ where: { id } })
        : await prisma.scimDirectoryGroup.count({ where: { id } });
    if (taken === 0) return id;
  }
  throw new Error("Could not reserve a SCIM directory id.");
}

async function loadState(companyId: number): Promise<ScimState> {
  const [users, groups] = await Promise.all([
    prisma.scimDirectoryUser.findMany({ where: { companyId } }),
    prisma.scimDirectoryGroup.findMany({ where: { companyId } }),
  ]);
  return {
    companyId,
    // Replaced by a database-reserved id before a create; reads never use it.
    seq: 1,
    users: users.map((row) => ({
      id: String(row.id),
      companyId: row.companyId,
      userName: row.userName,
      externalId: row.externalId,
      givenName: row.givenName,
      familyName: row.familyName,
      active: row.active,
      portalUserId: row.portalUserId,
    })),
    groups: groups.map((row) => ({
      id: String(row.id),
      companyId: row.companyId,
      displayName: row.displayName,
      memberIds: row.memberIds.map(String),
    })),
  };
}

async function saveState(db: Prisma.TransactionClient, before: ScimState, after: ScimState) {
  for (const user of after.users) {
    const id = Number(user.id);
    if (!before.users.some((row) => row.id === user.id)) {
      await db.scimDirectoryUser.create({
        data: {
          id,
          companyId: user.companyId,
          userName: user.userName,
          externalId: user.externalId,
          givenName: user.givenName,
          familyName: user.familyName,
          active: user.active,
          portalUserId: user.portalUserId,
        },
      });
      continue;
    }
    await db.scimDirectoryUser.update({
      where: { id },
      data: { active: user.active, givenName: user.givenName, familyName: user.familyName },
    });
  }
  for (const group of after.groups) {
    if (before.groups.some((row) => row.id === group.id)) {
      await db.scimDirectoryGroup.update({
        where: { id: Number(group.id) },
        data: { memberIds: group.memberIds.map(Number) },
      });
    } else {
      await db.scimDirectoryGroup.create({
        data: {
          id: Number(group.id),
          companyId: group.companyId,
          displayName: group.displayName,
          memberIds: group.memberIds.map(Number),
        },
      });
    }
  }
}

async function handle(request: Request, path: string[]) {
  const credential = await credentialFromBearer(request);
  if (!credential) return NextResponse.json({ detail: "Unauthorized." }, { status: 401 });
  const { companyId } = credential;
  let before = await loadState(companyId).catch(() => emptyDirectory(companyId));
  if (request.method === "POST" && path.length === 1 && (path[0] === "Users" || path[0] === "Groups")) {
    before = { ...before, seq: await allocateDirectoryId(path[0]) };
  }
  const url = new URL(request.url);
  const body = request.method === "GET" ? undefined : await request.json().catch(() => ({}));
  const result = applyScim({
    state: before,
    companyId,
    method: request.method,
    path: `/${path.join("/")}`,
    query: { filter: url.searchParams.get("filter"), startIndex: url.searchParams.get("startIndex"), count: url.searchParams.get("count") },
    body,
    now: new Date(),
  });
  // The directory change, the deprovision effects and the audit row commit together. If the audit row cannot be
  // written the whole change rolls back and the IdP gets a 500, so it retries rather than leaving an unaudited change.
  // The actor is the external identity provider, authenticated by the company's bearer token: role SCIM, no user id,
  // and the company comes from that token, never from the request.
  try {
    await prisma.$transaction(async (tx) => {
      if (result.state !== before) await saveState(tx, before, result.state);
      let audit = result.audit;
      if (result.deprovision) {
        // The entry this request just deactivated (not any earlier inactive one).
        const entry = result.state.users.find((row) => !row.active && before.users.find((old) => old.id === row.id)?.active);
        if (entry?.portalUserId) {
          const now = new Date();
          // Only a user of this company is touched. A link to anyone else is ignored, and the audit row then names the directory entry.
          const disabled = await tx.user.updateMany({ where: { id: entry.portalUserId, companyId }, data: { disabledAt: now, passwordChangedAt: now } });
          if (disabled.count === 1) await tx.apiToken.updateMany({ where: { companyId, revokedAt: null }, data: { revokedAt: now } });
          else if (audit) audit = { ...audit, ...userAuditTarget({ id: entry.id, portalUserId: null }) };
        }
        void deprovisionEffect(new Date());
      }
      if (audit) {
        await writeAuditLog(tx, { ...audit, companyId, actorUserId: null, actorRole: "SCIM", scimTokenId: credential.id });
      }
    });
  } catch (error) {
    // A concurrent create of the same userName or displayName loses to the unique key: that is the SCIM 409.
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") {
      const target = JSON.stringify((error as { meta?: { target?: unknown } }).meta?.target ?? "");
      if (/userName|displayName/.test(target)) {
        return NextResponse.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Already exists.", status: "409" }, { status: 409 });
      }
    }
    console.error("[scim] request not applied", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "The change could not be recorded and was not applied. Retry.", status: "500" }, { status: 500 });
  }
  // A 204 may not carry a body; NextResponse.json(null, { status: 204 }) throws after the change has committed.
  if (result.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return handle(request, path);
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return handle(request, path);
}

export async function PATCH(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return handle(request, path);
}

export async function PUT(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return handle(request, path);
}

export async function DELETE(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return handle(request, path);
}
