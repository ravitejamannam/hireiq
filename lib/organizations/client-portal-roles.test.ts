import { describe, expect, it } from "vitest";

import {
  canManageProviderConnections,
  canPrepareJobDistribution,
  canPublishJobDistribution,
  clientCapabilityAllowed,
  clientPortalAccess,
  isInvitableClientRole,
  ownershipTransferTargetAllowed,
  scopeClientRequirementFields,
  type ClientCapability,
  type ClientMembershipRole,
} from "@/lib/organizations/client-portal-roles";
import { assertInvitableOrganizationRole } from "@/lib/validation/organization-membership-validation";

const analysisFields = {
  title: "Engineer",
  location: "Bengaluru",
  mustHaveRequirements: "TypeScript",
  primarySkills: "React",
  jobDescription: "Build the product",
  evaluationCriteria: "System design",
  niceToHaveRequirements: "GraphQL",
  responsibilities: "Ship features",
  benefits: "Health cover",
  aboutCompany: "HireIQ",
};

describe("client portal roles", () => {
  it("keeps owner and member access and adds the two operating seats", () => {
    const owner = clientPortalAccess("OWNER");
    const member = clientPortalAccess("MEMBER");
    const hrHead = clientPortalAccess("HR_HEAD");
    const recruiter = clientPortalAccess("RECRUITER");

    expect(owner.manageTeam).toBe(true);
    expect(owner.distribution).toBe("manage");
    expect(owner.hireConfirmation).toBe("always");
    expect(owner.requirementIntake).toBe("full");

    expect(member.manageTeam).toBe(false);
    expect(member.viewBilling).toBe(true);
    expect(member.decideHiring).toBe(true);
    expect(member.distribution).toBe("prepare");
    expect(member.hireConfirmation).toBe("company-setting");

    expect(hrHead.label).toBe("HR Head");
    expect(hrHead.requirementIntake).toBe("basic");
    expect(hrHead.analyzeRequirements).toBe(false);
    expect(hrHead.showCandidates).toBe(false);
    expect(hrHead.distribution).toBe("none");
    expect(hrHead.viewBilling).toBe(false);
    expect(hrHead.decideHiring).toBe(false);
    expect(hrHead.manageTeam).toBe(false);

    expect(recruiter.label).toBe("Recruiter");
    expect(recruiter.requirementIntake).toBe("full");
    expect(recruiter.analyzeRequirements).toBe(true);
    expect(recruiter.showCandidates).toBe(true);
    expect(recruiter.distribution).toBe("publish");
    expect(recruiter.viewBilling).toBe(false);
    expect(recruiter.decideHiring).toBe(false);
    expect(recruiter.manageTeam).toBe(false);
  });

  it("invites members, HR heads, and recruiters, and never an owner", () => {
    expect(isInvitableClientRole("MEMBER")).toBe(true);
    expect(isInvitableClientRole("HR_HEAD")).toBe(true);
    expect(isInvitableClientRole("RECRUITER")).toBe(true);
    expect(isInvitableClientRole("OWNER")).toBe(false);
    expect(assertInvitableOrganizationRole("HR_HEAD")).toBe("HR_HEAD");
    expect(() => assertInvitableOrganizationRole("OWNER")).toThrow(
      /cannot create an owner/,
    );
  });

  it("lets a recruiter post to job portals without managing provider credentials", () => {
    expect(canPrepareJobDistribution("RECRUITER")).toBe(true);
    expect(canPublishJobDistribution("RECRUITER")).toBe(true);
    expect(canManageProviderConnections("RECRUITER")).toBe(false);
    expect(canPublishJobDistribution("MEMBER")).toBe(false);
    expect(canPrepareJobDistribution("MEMBER")).toBe(true);
    expect(canPublishJobDistribution("HR_HEAD")).toBe(false);
    expect(canPrepareJobDistribution("HR_HEAD")).toBe(false);
    expect(canManageProviderConnections("OWNER")).toBe(true);
    expect(canPrepareJobDistribution(null)).toBe(false);
    expect(canPublishJobDistribution(null)).toBe(false);
    expect(canManageProviderConnections(null)).toBe(false);
  });

  it("enforces the client capability matrix without changing member access", () => {
    const capabilities: ClientCapability[] = [
      "manageTeam",
      "viewBilling",
      "analyzeRequirements",
      "showCandidates",
      "decideHiring",
      "prepareDistribution",
      "publishDistribution",
      "manageProviderConnections",
    ];
    const allowed: Record<ClientMembershipRole, ClientCapability[]> = {
      OWNER: capabilities,
      MEMBER: [
        "viewBilling",
        "analyzeRequirements",
        "showCandidates",
        "decideHiring",
        "prepareDistribution",
      ],
      HR_HEAD: [],
      RECRUITER: [
        "analyzeRequirements",
        "showCandidates",
        "prepareDistribution",
        "publishDistribution",
      ],
    };

    for (const role of ["OWNER", "MEMBER", "HR_HEAD", "RECRUITER"] as const) {
      for (const capability of capabilities) {
        expect(clientCapabilityAllowed(role, capability)).toBe(
          allowed[role].includes(capability),
        );
      }
    }

    expect(clientCapabilityAllowed(null, "showCandidates")).toBe(false);
    expect(clientCapabilityAllowed(undefined, "viewBilling")).toBe(false);
    expect(ownershipTransferTargetAllowed("MEMBER")).toBe(true);
    expect(ownershipTransferTargetAllowed("HR_HEAD")).toBe(false);
    expect(ownershipTransferTargetAllowed("RECRUITER")).toBe(false);
    expect(ownershipTransferTargetAllowed("OWNER")).toBe(false);
  });

  it("drops analysis fields when an HR Head posts a requirement", () => {
    expect(scopeClientRequirementFields("HR_HEAD", analysisFields)).toEqual({
      title: "Engineer",
      location: "Bengaluru",
      mustHaveRequirements: "TypeScript",
    });
    expect(scopeClientRequirementFields("RECRUITER", analysisFields)).toEqual(
      analysisFields,
    );
    expect(scopeClientRequirementFields("OWNER", analysisFields)).toEqual(
      analysisFields,
    );
  });
});
