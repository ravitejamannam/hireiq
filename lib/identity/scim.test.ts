import { describe, expect, it } from "vitest";

import { applyScim, emptyDirectory, roleFromGroups, sessionRevoked, type ScimState } from "@/lib/identity/scim";

const now = new Date("2026-10-18T12:00:00.000Z");

function call(state: ScimState, method: string, path: string, body?: unknown, query: { filter?: string; startIndex?: string; count?: string } = {}, companyId = 1) {
  return applyScim({ state, companyId, method, path, query, body, now });
}

function directoryWithPriya() {
  const created = call(emptyDirectory(1), "POST", "/Users", {
    userName: "Priya@Nimbus.example",
    name: { givenName: "Priya", familyName: "R" },
    externalId: "okta-1",
    active: true,
  });
  return created;
}

describe("SCIM discovery", () => {
  it("advertises patch and bearer auth the way Okta and Azure expect", () => {
    const config = call(emptyDirectory(1), "GET", "/ServiceProviderConfig");
    expect(config.status).toBe(200);
    expect((config.body as { patch: { supported: boolean } }).patch.supported).toBe(true);
    expect((config.body as { authenticationSchemes: Array<{ type: string }> }).authenticationSchemes[0]?.type).toBe("oauthbearertoken");
  });

  it("lists User and Group schemas and resource types", () => {
    const schemas = call(emptyDirectory(1), "GET", "/Schemas");
    const types = call(emptyDirectory(1), "GET", "/ResourceTypes");
    expect((schemas.body as { totalResults: number }).totalResults).toBe(2);
    expect((types.body as { Resources: Array<{ endpoint: string }> }).Resources.map((row) => row.endpoint)).toEqual(["/Users", "/Groups"]);
  });
});

describe("SCIM users", () => {
  it("creates a user and returns the core schema", () => {
    const created = directoryWithPriya();
    expect(created.status).toBe(201);
    const body = created.body as { id: string; userName: string; meta: { resourceType: string }; active: boolean };
    expect(body.userName).toBe("priya@nimbus.example");
    expect(body.meta.resourceType).toBe("User");
    expect(body.active).toBe(true);
    expect(created.audit?.action).toBe("SCIM_USER_CREATED");
  });

  it("rejects a duplicate userName and a userName that is not an email", () => {
    const created = directoryWithPriya();
    expect(call(created.state, "POST", "/Users", { userName: "priya@nimbus.example" }).status).toBe(409);
    expect(call(emptyDirectory(1), "POST", "/Users", { userName: "not-an-email" }).status).toBe(400);
  });

  it("filters by userName, email, and externalId, and rejects an unsupported operator", () => {
    const created = directoryWithPriya();
    expect((call(created.state, "GET", "/Users", undefined, { filter: 'userName eq "PRIYA@nimbus.example"' }).body as { totalResults: number }).totalResults).toBe(1);
    expect((call(created.state, "GET", "/Users", undefined, { filter: 'emails[type eq "work"].value eq "priya@nimbus.example"' }).body as { totalResults: number }).totalResults).toBe(1);
    expect((call(created.state, "GET", "/Users", undefined, { filter: 'externalId eq "okta-1"' }).body as { totalResults: number }).totalResults).toBe(1);
    expect((call(created.state, "GET", "/Users", undefined, { filter: 'userName eq "missing@nimbus.example"' }).body as { totalResults: number }).totalResults).toBe(0);
    const bad = call(created.state, "GET", "/Users", undefined, { filter: 'userName co "priya"' });
    expect(bad.status).toBe(400);
    expect((bad.body as { status: string }).status).toBe("400");
  });

  it("pages results with a 1-based startIndex", () => {
    let state = emptyDirectory(1);
    for (const name of ["a@nimbus.example", "b@nimbus.example", "c@nimbus.example"]) {
      state = call(state, "POST", "/Users", { userName: name }).state;
    }
    const page = call(state, "GET", "/Users", undefined, { startIndex: "2", count: "1" });
    const body = page.body as { totalResults: number; itemsPerPage: number; Resources: Array<{ userName: string }> };
    expect(body.totalResults).toBe(3);
    expect(body.itemsPerPage).toBe(1);
    expect(body.Resources[0]?.userName).toBe("b@nimbus.example");
  });

  it("returns 404 for a missing user and for another company's directory", () => {
    const created = directoryWithPriya();
    const missing = call(created.state, "GET", "/Users/999");
    expect(missing.status).toBe(404);
    expect((missing.body as { schemas: string[] }).schemas[0]).toMatch(/Error/);
    expect(call(created.state, "GET", "/Users/1", undefined, {}, 2).status).toBe(404);
    expect(call(created.state, "PATCH", "/Users/1", { Operations: [{ op: "replace", path: "active", value: false }] }, {}, 2).status).toBe(404);
  });

  it("deactivates with Okta's value object and Azure's Replace active False", () => {
    const created = directoryWithPriya();
    const okta = call(created.state, "PATCH", "/Users/1", { Operations: [{ op: "replace", value: { active: false } }] });
    expect((okta.body as { active: boolean }).active).toBe(false);
    expect(okta.deprovision?.completedWithinMs).toBe(0);
    expect(okta.deprovision?.revokeSessions).toBe(true);
    expect(okta.deprovision?.revokeApiKeys).toBe(true);
    const again = call(okta.state, "PATCH", "/Users/1", { Operations: [{ op: "Replace", path: "active", value: "False" }] });
    expect(again.deprovision).not.toBeNull();
    const back = call(again.state, "PATCH", "/Users/1", { Operations: [{ op: "replace", path: "active", value: true }] });
    expect((back.body as { active: boolean }).active).toBe(true);
    expect(back.deprovision).toBeNull();
    expect(sessionRevoked({ disabledAt: okta.deprovision!.disabledAt, passwordChangedAt: okta.deprovision!.passwordChangedAt, tokenPwdAt: now.getTime() - 5_000 })).toBe(true);
  });

  it("patches a name, replaces the user with PUT, and deletes with deprovision", () => {
    const created = directoryWithPriya();
    const renamed = call(created.state, "PATCH", "/Users/1", {
      Operations: [
        { op: "replace", path: "name.givenName", value: "Priya" },
        { op: "replace", path: "name.familyName", value: "Raghavan" },
      ],
    });
    expect((renamed.body as { name: { familyName: string } }).name.familyName).toBe("Raghavan");
    const replaced = call(renamed.state, "PUT", "/Users/1", { userName: "priya@nimbus.example", name: { givenName: "P", familyName: "R" }, active: true });
    expect((replaced.body as { id: string; name: { givenName: string } }).id).toBe("1");
    expect((replaced.body as { name: { givenName: string } }).name.givenName).toBe("P");
    const removed = call(replaced.state, "DELETE", "/Users/1");
    expect(removed.status).toBe(204);
    expect(removed.deprovision?.revokeApiKeys).toBe(true);
    expect((call(removed.state, "GET", "/Users/1").body as { active: boolean }).active).toBe(false);
  });

  it("rejects an unknown patch operation", () => {
    const created = directoryWithPriya();
    expect(call(created.state, "PATCH", "/Users/1", { Operations: [{ op: "remove", path: "title" }] }).status).toBe(400);
  });
});

describe("SCIM groups", () => {
  it("creates, filters, fetches, and rejects a duplicate display name", () => {
    const created = call(emptyDirectory(1), "POST", "/Groups", { displayName: "Recruiters" });
    expect(created.status).toBe(201);
    expect(call(created.state, "POST", "/Groups", { displayName: "recruiters" }).status).toBe(409);
    expect((call(created.state, "GET", "/Groups", undefined, { filter: 'displayName eq "Recruiters"' }).body as { totalResults: number }).totalResults).toBe(1);
    expect(call(created.state, "GET", `/Groups/${(created.body as { id: string }).id}`).status).toBe(200);
    expect(call(created.state, "GET", `/Groups/${(created.body as { id: string }).id}`, undefined, {}, 2).status).toBe(404);
  });

  it("adds a member once, removes that member, and replaces the member list", () => {
    const user = directoryWithPriya();
    const group = call(user.state, "POST", "/Groups", { displayName: "Recruiters" });
    const id = (group.body as { id: string }).id;
    const added = call(group.state, "PATCH", `/Groups/${id}`, { Operations: [{ op: "add", path: "members", value: { value: "1" } }] });
    const duplicate = call(added.state, "PATCH", `/Groups/${id}`, { Operations: [{ op: "add", path: "members", value: [{ value: "1" }] }] });
    expect((duplicate.body as { members: unknown[] }).members).toHaveLength(1);
    const removed = call(duplicate.state, "PATCH", `/Groups/${id}`, { Operations: [{ op: "remove", path: 'members[value eq "1"]' }] });
    expect((removed.body as { members: unknown[] }).members).toHaveLength(0);
    const replaced = call(removed.state, "PUT", `/Groups/${id}`, { displayName: "Recruiters", members: [{ value: "1" }, { value: "2" }] });
    expect((replaced.body as { members: unknown[] }).members).toHaveLength(2);
    const cleared = call(replaced.state, "PATCH", `/Groups/${id}`, { Operations: [{ op: "replace", path: "members", value: [] }] });
    expect((cleared.body as { members: unknown[] }).members).toHaveLength(0);
  });
});

describe("SCIM role mapping", () => {
  it("maps IdP groups onto company roles and never a platform operator", () => {
    expect(roleFromGroups(["HireIQ Interviewers"], [{ groupName: "HireIQ Interviewers", portalRole: "INTERVIEWER" }])).toMatchObject({ portalRole: "INTERVIEWER", platformOperator: false });
    expect(roleFromGroups(["Owners"], [{ groupName: "Owners", portalRole: "SUPERUSER" }])).toMatchObject({ portalRole: "CLIENT", platformOperator: false });
    expect(roleFromGroups(["Nobody"], []).platformOperator).toBe(false);
  });
});
