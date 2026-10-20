import { assertSsoIdentity, emailDomain, type SsoConnection } from "@/lib/auth/sso";

export type AuditEntry = {
  companyId: number;
  action: string;
  targetType: string;
  targetId: number;
  reason: string;
};

export type ScimUser = {
  id: string;
  companyId: number;
  userName: string;
  externalId: string | null;
  givenName: string;
  familyName: string;
  active: boolean;
  portalUserId: number | null;
};

export type ScimGroup = {
  id: string;
  companyId: number;
  displayName: string;
  memberIds: string[];
};

export type ScimState = {
  companyId: number;
  users: ScimUser[];
  groups: ScimGroup[];
  seq: number;
};

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

/**
 * What a user-level event actually touched. A User is named only when the directory entry is linked to one; an
 * unlinked entry is the directory row itself, so its id is never presented as a User id. (The route also checks the
 * linked user belongs to the company before it keeps this target.)
 */
export function userAuditTarget(user: Pick<ScimUser, "id" | "portalUserId">) {
  return user.portalUserId
    ? { targetType: "User", targetId: user.portalUserId }
    : { targetType: "ScimDirectoryUser", targetId: Number(user.id) };
}

export function emptyDirectory(companyId: number): ScimState {
  return { companyId, users: [], groups: [], seq: 1 };
}

export function deprovisionEffect(now: Date) {
  return {
    disabledAt: now.toISOString(),
    passwordChangedAt: now.toISOString(),
    revokeApiKeys: true,
    revokeSessions: true,
    completedWithinMs: 0,
  };
}

export function sessionRevoked(input: { disabledAt: string | null; passwordChangedAt: string | null; tokenPwdAt: number }) {
  if (input.disabledAt) return true;
  if (input.passwordChangedAt && Date.parse(input.passwordChangedAt) > input.tokenPwdAt) return true;
  return false;
}

export function roleFromGroups(groups: string[], maps: Array<{ groupName: string; portalRole: string }>) {
  const match = maps.find((row) => groups.some((group) => group.toLowerCase() === row.groupName.toLowerCase()));
  const portalRole = match?.portalRole ?? "CLIENT";
  if (!["CLIENT", "INTERVIEWER", "ADMIN"].includes(portalRole)) {
    return { portalRole: "CLIENT" as const, platformOperator: false, reason: "Unmapped group stays a company member." };
  }
  return { portalRole: portalRole as "CLIENT" | "INTERVIEWER" | "ADMIN", platformOperator: false, reason: match ? `Mapped from ${match.groupName}.` : "No group map." };
}

export function oidcIdentityAllowed(input: { email: string; issuer: string; connection: SsoConnection }) {
  return assertSsoIdentity(input);
}

function userResource(user: ScimUser) {
  return {
    schemas: [USER_SCHEMA],
    id: user.id,
    userName: user.userName,
    name: { givenName: user.givenName, familyName: user.familyName },
    active: user.active,
    meta: { resourceType: "User" },
  };
}

function groupResource(group: ScimGroup) {
  return {
    schemas: [GROUP_SCHEMA],
    id: group.id,
    displayName: group.displayName,
    members: group.memberIds.map((value) => ({ value })),
    meta: { resourceType: "Group" },
  };
}

function listResponse(resources: unknown[], startIndex: number) {
  return {
    schemas: [LIST_SCHEMA],
    totalResults: resources.length,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

function sameCompany(state: ScimState, companyId: number) {
  return state.companyId === companyId;
}

const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

function scimError(status: number, detail: string) {
  return { schemas: [ERROR_SCHEMA], status: String(status), detail };
}

function parseFilter(filter: string | null) {
  if (!filter) return null;
  const email = filter.match(/emails(?:\[[^\]]+\])?\.value\s+eq\s+"([^"]+)"/i);
  if (email) return { field: "username", value: email[1].toLowerCase() };
  const match = filter.match(/(userName|displayName|externalId|emails\.value)\s+eq\s+"([^"]+)"/i);
  if (!match) return { unsupported: true as const };
  const field = match[1].toLowerCase() === "emails.value" ? "username" : match[1].toLowerCase();
  return { field, value: match[2].toLowerCase() };
}

function asBool(value: unknown) {
  if (value === true || value === "true" || value === "True") return true;
  if (value === false || value === "false" || value === "False") return false;
  return null;
}

type PatchOp = { op?: string; path?: string; value?: unknown };

function applyUserPatch(user: ScimUser, operations: PatchOp[]) {
  let next = { ...user };
  for (const operation of operations) {
    const op = operation.op?.toLowerCase();
    const path = operation.path ?? "";
    if (op === "replace" && path.toLowerCase() === "active") {
      const active = asBool(operation.value);
      if (active === null) return { error: "active must be a boolean." };
      next = { ...next, active };
      continue;
    }
    if (op === "replace" && path === "name.givenName" && typeof operation.value === "string") {
      next = { ...next, givenName: operation.value };
      continue;
    }
    if (op === "replace" && path === "name.familyName" && typeof operation.value === "string") {
      next = { ...next, familyName: operation.value };
      continue;
    }
    if (op === "replace" && (path.toLowerCase() === "username" || /emails/i.test(path)) && typeof operation.value === "string") {
      next = { ...next, userName: operation.value.trim().toLowerCase() };
      continue;
    }
    if (op === "replace" && !path && operation.value && typeof operation.value === "object") {
      const value = operation.value as { active?: unknown; userName?: string; name?: { givenName?: string; familyName?: string }; externalId?: string };
      if ("active" in value) {
        const active = asBool(value.active);
        if (active === null) return { error: "active must be a boolean." };
        next = { ...next, active };
      }
      if (typeof value.userName === "string") next = { ...next, userName: value.userName.trim().toLowerCase() };
      if (value.name?.givenName != null) next = { ...next, givenName: value.name.givenName };
      if (value.name?.familyName != null) next = { ...next, familyName: value.name.familyName };
      if (typeof value.externalId === "string") next = { ...next, externalId: value.externalId };
      continue;
    }
    return { error: "Unsupported patch." };
  }
  return { user: next };
}

function memberValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value && typeof (value as { value?: unknown }).value === "string") {
    return (value as { value: string }).value;
  }
  return null;
}

function applyGroupPatch(memberIds: string[], operations: PatchOp[]) {
  let next = [...memberIds];
  for (const operation of operations) {
    const op = operation.op?.toLowerCase();
    const path = operation.path ?? "";
    if (op === "add") {
      const values = Array.isArray(operation.value) ? operation.value : [operation.value];
      for (const value of values) {
        const id = memberValue(value);
        if (id && !next.includes(id)) next.push(id);
      }
      continue;
    }
    if (op === "remove") {
      const match = path.match(/members\[value eq "([^"]+)"\]/i);
      if (match) {
        next = next.filter((id) => id !== match[1]);
        continue;
      }
      const id = memberValue(operation.value);
      if (path.toLowerCase() === "members" && id) {
        next = next.filter((row) => row !== id);
        continue;
      }
      return { error: "Unsupported patch." };
    }
    if (op === "replace" && path.toLowerCase() === "members" && Array.isArray(operation.value)) {
      next = operation.value.map(memberValue).filter((id): id is string => Boolean(id));
      continue;
    }
    return { error: "Unsupported patch." };
  }
  return { memberIds: next };
}

export function applyScim(input: {
  state: ScimState;
  companyId: number;
  method: string;
  path: string;
  query: { filter?: string | null; startIndex?: string | null; count?: string | null };
  body?: unknown;
  now: Date;
}): { state: ScimState; status: number; body: unknown; audit: AuditEntry | null; deprovision: ReturnType<typeof deprovisionEffect> | null } {
  if (!sameCompany(input.state, input.companyId)) {
    return { state: input.state, status: 404, body: scimError(404, "Not found."), audit: null, deprovision: null };
  }
  const path = input.path.replace(/\/$/, "") || "/";
  if (input.method === "GET" && path === "/ServiceProviderConfig") {
    return {
      state: input.state,
      status: 200,
      body: {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        patch: { supported: true },
        bulk: { supported: false },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer" }],
      },
      audit: null,
      deprovision: null,
    };
  }
  if (input.method === "GET" && path === "/Schemas") {
    return {
      state: input.state,
      status: 200,
      body: listResponse([{ id: USER_SCHEMA, name: "User" }, { id: GROUP_SCHEMA, name: "Group" }], 1),
      audit: null,
      deprovision: null,
    };
  }
  if (input.method === "GET" && path === "/ResourceTypes") {
    return {
      state: input.state,
      status: 200,
      body: listResponse([
        { id: "User", endpoint: "/Users", schema: USER_SCHEMA },
        { id: "Group", endpoint: "/Groups", schema: GROUP_SCHEMA },
      ], 1),
      audit: null,
      deprovision: null,
    };
  }

  const filter = parseFilter(input.query.filter ?? null);
  if (filter && "unsupported" in filter) {
    return { state: input.state, status: 400, body: scimError(400, "That filter is not supported."), audit: null, deprovision: null };
  }
  const startIndex = Math.max(1, Number(input.query.startIndex ?? "1") || 1);
  const count = Math.max(1, Number(input.query.count ?? "100") || 100);

  if (path === "/Users" && input.method === "GET") {
    let rows = input.state.users.filter((user) => user.companyId === input.companyId);
    if (filter && (filter.field === "username" || filter.field === "externalid")) {
      rows = rows.filter((user) => filter.field === "externalid" ? (user.externalId ?? "").toLowerCase() === filter.value : user.userName === filter.value);
    }
    const page = rows.slice(startIndex - 1, startIndex - 1 + count);
    return { state: input.state, status: 200, body: { ...listResponse(page.map(userResource), startIndex), totalResults: rows.length }, audit: null, deprovision: null };
  }

  if (path === "/Users" && input.method === "POST") {
    const body = input.body as { userName?: string; name?: { givenName?: string; familyName?: string }; externalId?: string; active?: boolean };
    const userName = body.userName?.trim().toLowerCase() ?? "";
    if (!userName.includes("@") || emailDomain(userName).length < 3) {
      return { state: input.state, status: 400, body: scimError(400, "userName must be an email."), audit: null, deprovision: null };
    }
    if (input.state.users.some((user) => user.userName === userName)) {
      return { state: input.state, status: 409, body: scimError(409, "User already exists."), audit: null, deprovision: null };
    }
    const user: ScimUser = {
      id: String(input.state.seq),
      companyId: input.companyId,
      userName,
      externalId: body.externalId ?? null,
      givenName: body.name?.givenName ?? "",
      familyName: body.name?.familyName ?? "",
      active: body.active !== false,
      portalUserId: null,
    };
    const state = { ...input.state, seq: input.state.seq + 1, users: [...input.state.users, user] };
    return {
      state,
      status: 201,
      body: userResource(user),
      audit: { companyId: input.companyId, action: "SCIM_USER_CREATED", targetType: "ScimDirectoryUser", targetId: Number(user.id), reason: user.userName },
      deprovision: null,
    };
  }

  const userMatch = path.match(/^\/Users\/([^/]+)$/);
  if (userMatch) {
    const user = input.state.users.find((row) => row.id === decodeURIComponent(userMatch[1]) && row.companyId === input.companyId);
    if (!user) return { state: input.state, status: 404, body: scimError(404, "Not found."), audit: null, deprovision: null };
    if (input.method === "GET") return { state: input.state, status: 200, body: userResource(user), audit: null, deprovision: null };
    if (input.method === "DELETE") {
      const next = { ...user, active: false };
      return {
        state: { ...input.state, users: input.state.users.map((row) => row.id === user.id ? next : row) },
        status: 204,
        body: null,
        audit: { companyId: input.companyId, action: "SCIM_USER_DEPROVISIONED", ...userAuditTarget(user), reason: "IdP deleted the user. Sessions and API keys are revoked immediately." },
        deprovision: deprovisionEffect(input.now),
      };
    }
    if (input.method === "PUT") {
      const body = (input.body ?? {}) as { userName?: string; name?: { givenName?: string; familyName?: string }; active?: unknown; externalId?: string };
      const active = asBool(body.active);
      const next = {
        ...user,
        userName: body.userName?.trim().toLowerCase() || user.userName,
        givenName: body.name?.givenName ?? user.givenName,
        familyName: body.name?.familyName ?? user.familyName,
        externalId: body.externalId ?? user.externalId,
        active: active ?? user.active,
      };
      const deprovision = next.active ? null : deprovisionEffect(input.now);
      return {
        state: { ...input.state, users: input.state.users.map((row) => row.id === user.id ? next : row) },
        status: 200,
        body: userResource(next),
        audit: { companyId: input.companyId, action: next.active ? "SCIM_USER_REPLACED" : "SCIM_USER_DEPROVISIONED", ...userAuditTarget(user), reason: "User replaced." },
        deprovision,
      };
    }
    if (input.method === "PATCH") {
      const patched = applyUserPatch(user, ((input.body ?? {}) as { Operations?: PatchOp[] }).Operations ?? []);
      if (patched.error || !patched.user) return { state: input.state, status: 400, body: scimError(400, patched.error ?? "Unsupported patch."), audit: null, deprovision: null };
      const deprovision = patched.user.active ? null : deprovisionEffect(input.now);
      return {
        state: { ...input.state, users: input.state.users.map((row) => row.id === user.id ? patched.user! : row) },
        status: 200,
        body: userResource(patched.user),
        audit: {
          companyId: input.companyId,
          action: patched.user.active ? "SCIM_USER_UPDATED" : "SCIM_USER_DEPROVISIONED",
          ...userAuditTarget(user),
          reason: patched.user.active ? "IdP updated the user." : "IdP deactivated the user. Sessions and API keys are revoked immediately.",
        },
        deprovision,
      };
    }
  }

  if (path === "/Groups" && input.method === "GET") {
    let rows = input.state.groups.filter((group) => group.companyId === input.companyId);
    if (filter && filter.field === "displayname") rows = rows.filter((group) => group.displayName.toLowerCase() === filter.value);
    const page = rows.slice(startIndex - 1, startIndex - 1 + count);
    return { state: input.state, status: 200, body: { ...listResponse(page.map(groupResource), startIndex), totalResults: rows.length }, audit: null, deprovision: null };
  }

  if (path === "/Groups" && input.method === "POST") {
    const body = input.body as { displayName?: string; members?: Array<{ value: string }> };
    const displayName = body.displayName?.trim() ?? "";
    if (!displayName) return { state: input.state, status: 400, body: scimError(400, "displayName is required."), audit: null, deprovision: null };
    if (input.state.groups.some((group) => group.displayName.toLowerCase() === displayName.toLowerCase())) {
      return { state: input.state, status: 409, body: scimError(409, "Group already exists."), audit: null, deprovision: null };
    }
    const group: ScimGroup = {
      id: String(input.state.seq),
      companyId: input.companyId,
      displayName,
      memberIds: (body.members ?? []).map((member) => member.value),
    };
    const state = { ...input.state, seq: input.state.seq + 1, groups: [...input.state.groups, group] };
    return {
      state,
      status: 201,
      body: groupResource(group),
      audit: { companyId: input.companyId, action: "SCIM_GROUP_CREATED", targetType: "ScimDirectoryGroup", targetId: Number(group.id), reason: displayName },
      deprovision: null,
    };
  }

  const groupMatch = path.match(/^\/Groups\/([^/]+)$/);
  if (groupMatch) {
    const group = input.state.groups.find((row) => row.id === decodeURIComponent(groupMatch[1]) && row.companyId === input.companyId);
    if (!group) return { state: input.state, status: 404, body: scimError(404, "Not found."), audit: null, deprovision: null };
    if (input.method === "GET") return { state: input.state, status: 200, body: groupResource(group), audit: null, deprovision: null };
    if (input.method === "PUT") {
      const body = (input.body ?? {}) as { displayName?: string; members?: Array<{ value: string }> };
      const next = { ...group, displayName: body.displayName?.trim() || group.displayName, memberIds: (body.members ?? []).map((member) => member.value) };
      return {
        state: { ...input.state, groups: input.state.groups.map((row) => row.id === group.id ? next : row) },
        status: 200,
        body: groupResource(next),
        audit: { companyId: input.companyId, action: "SCIM_GROUP_UPDATED", targetType: "ScimDirectoryGroup", targetId: Number(group.id), reason: next.displayName },
        deprovision: null,
      };
    }
    if (input.method === "PATCH") {
      const patched = applyGroupPatch(group.memberIds, ((input.body ?? {}) as { Operations?: PatchOp[] }).Operations ?? []);
      if (patched.error || !patched.memberIds) return { state: input.state, status: 400, body: scimError(400, patched.error ?? "Unsupported patch."), audit: null, deprovision: null };
      const next = { ...group, memberIds: patched.memberIds };
      return {
        state: { ...input.state, groups: input.state.groups.map((row) => row.id === group.id ? next : row) },
        status: 200,
        body: groupResource(next),
        audit: { companyId: input.companyId, action: "SCIM_GROUP_UPDATED", targetType: "ScimDirectoryGroup", targetId: Number(group.id), reason: group.displayName },
        deprovision: null,
      };
    }
  }

  return { state: input.state, status: 404, body: scimError(404, "Not found."), audit: null, deprovision: null };
}
