import { describe, expect, it } from "vitest";
import { PortalRole } from "@prisma/client";

import { isAdminRankingRole } from "@/lib/validation/candidate-ranking-validation";
import { isAdminEvidenceGraphRole } from "@/lib/validation/evidence-graph-validation";
import { isAdminLexicalRetrievalRole } from "@/lib/validation/lexical-retrieval-validation";
import { isAdminMatcherV2Role } from "@/lib/validation/requirement-assessment-validation";
import { isAdminSemanticRetrievalRole } from "@/lib/validation/semantic-retrieval-validation";

describe("admin role boundaries", () => {
  it("keeps Matcher V2, T94, M8, M9, and evidence graph admin-only", () => {
    const gates = [
      isAdminMatcherV2Role,
      isAdminRankingRole,
      isAdminLexicalRetrievalRole,
      isAdminSemanticRetrievalRole,
      isAdminEvidenceGraphRole,
    ];

    for (const gate of gates) {
      expect(gate(PortalRole.ADMIN)).toBe(true);
      expect(gate(PortalRole.CLIENT)).toBe(false);
      expect(gate(PortalRole.INTERVIEWER)).toBe(false);
    }
  });
});
