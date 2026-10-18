import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { applyScim, deprovisionEffect, emptyDirectory, type ScimState } from "@/lib/identity/scim";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function companyIdFromBearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await prisma.scimToken.findFirst({ where: { tokenHash, revokedAt: null }, select: { companyId: true } });
  return row?.companyId ?? null;
}

async function loadState(companyId: number): Promise<ScimState> {
  const [users, groups] = await Promise.all([
    prisma.scimDirectoryUser.findMany({ where: { companyId } }),
    prisma.scimDirectoryGroup.findMany({ where: { companyId } }),
  ]);
  const maxId = Math.max(0, ...users.map((row) => row.id), ...groups.map((row) => row.id));
  return {
    companyId,
    seq: maxId + 1,
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

async function saveState(before: ScimState, after: ScimState) {
  for (const user of after.users) {
    const id = Number(user.id);
    if (!before.users.some((row) => row.id === user.id)) {
      await prisma.scimDirectoryUser.create({
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
    await prisma.scimDirectoryUser.update({
      where: { id },
      data: { active: user.active, givenName: user.givenName, familyName: user.familyName },
    });
  }
  for (const group of after.groups) {
    if (before.groups.some((row) => row.id === group.id)) {
      await prisma.scimDirectoryGroup.update({
        where: { id: Number(group.id) },
        data: { memberIds: group.memberIds.map(Number) },
      });
    } else {
      await prisma.scimDirectoryGroup.create({
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
  const companyId = await companyIdFromBearer(request);
  if (!companyId) return NextResponse.json({ detail: "Unauthorized." }, { status: 401 });
  const before = await loadState(companyId).catch(() => emptyDirectory(companyId));
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
  if (result.state !== before) await saveState(before, result.state);
  if (result.deprovision) {
    const user = result.state.users.find((row) => row.active === false);
    if (user?.portalUserId) {
      const now = new Date();
      await prisma.user.update({ where: { id: user.portalUserId }, data: { disabledAt: now, passwordChangedAt: now } });
      await prisma.apiToken.updateMany({ where: { companyId, revokedAt: null }, data: { revokedAt: now } });
    }
    void deprovisionEffect(new Date());
  }
  if (result.audit) {
    await writeAuditLog(prisma, { ...result.audit, actorUserId: 0, actorRole: "SCIM" }).catch(() => undefined);
  }
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
