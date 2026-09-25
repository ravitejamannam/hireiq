import { describe, expect, it } from "vitest";

import {
  canonicalSkillKey,
  isKnownDistinctPair,
  resolveSkillAlias,
} from "@/lib/ontology/skill-alias";

describe("skill alias catalog", () => {
  it("maps genuine aliases to one concept", () => {
    expect(canonicalSkillKey("JS")).toBe("javascript");
    expect(canonicalSkillKey("Postgres")).toBe("postgresql");
    expect(canonicalSkillKey("Golang")).toBe("golang");
  });

  it("does not collapse React and React Native", () => {
    expect(canonicalSkillKey("React")).toBe("react");
    expect(canonicalSkillKey("React Native")).toBe("react_native");
    expect(isKnownDistinctPair("React", "React Native")).toBe(true);
  });

  it("does not treat Python as Django", () => {
    expect(canonicalSkillKey("Python")).toBe("python");
    expect(canonicalSkillKey("Django")).toBe("django");
    expect(isKnownDistinctPair("Python", "Django")).toBe(true);
    expect(resolveSkillAlias("Python")?.canonicalKey).not.toBe("django");
  });
});
