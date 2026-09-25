import { describe, expect, it } from "vitest";
import { CandidateClaimPolarity } from "@prisma/client";

import { extractClaimsDeterministically } from "@/lib/candidates/intelligence/deterministic-extractor";

describe("deterministic candidate extraction", () => {
  it("extracts a positive skill mention with a source span", () => {
    const text = "Built Python backend services.";
    const claims = extractClaimsDeterministically(text);
    const python = claims.find((claim) => claim.normalizedValue === "python");
    expect(python?.polarity).toBe(CandidateClaimPolarity.POSITIVE);
    expect(python?.sourceSpanStart).toBe(text.indexOf("Python"));
  });

  it("does not treat a negated skill as positive", () => {
    const claims = extractClaimsDeterministically(
      "Python experience, but no Django experience.",
    );
    const python = claims.find((claim) => claim.normalizedValue === "python");
    const django = claims.find((claim) => claim.normalizedValue === "django");
    expect(python?.polarity).toBe(CandidateClaimPolarity.POSITIVE);
    expect(django?.polarity).toBe(CandidateClaimPolarity.NEGATED);
  });

  it("keeps React Native distinct from React", () => {
    const claims = extractClaimsDeterministically(
      "Shipped a React Native app. No React web work.",
    );
    expect(claims.some((claim) => claim.normalizedValue === "react_native" && claim.polarity === CandidateClaimPolarity.POSITIVE)).toBe(true);
    expect(claims.some((claim) => claim.normalizedValue === "react" && claim.polarity === CandidateClaimPolarity.NEGATED)).toBe(true);
  });
});
