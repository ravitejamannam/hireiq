import { assertAIEvaluationAllowed } from "@/lib/ai/opt-out";
import { completeStructured } from "@/lib/ai/gateway";
import { withAIRun } from "@/lib/ai/run";
import { resolveSkillAlias } from "@/lib/ontology/skill-alias";

export type RequirementCheckKind = "years" | "skill" | "domain" | "prose";

export type RequirementCheck = {
  sourceField: "mustHaveRequirements" | "niceToHaveRequirements";
  kind: RequirementCheckKind;
  text: string;
  minYears?: number;
  maxYears?: number;
  skill?: string;
};

const DOMAIN_WORDS = ["startup", "fintech", "healthcare", "payments", "distributed systems"];

export function parseRequirementChecks(
  text: string | null | undefined,
  sourceField: RequirementCheck["sourceField"],
): RequirementCheck[] {
  if (!text?.trim()) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => splitConjunction(line, sourceField));
}

function splitConjunction(line: string, sourceField: RequirementCheck["sourceField"]) {
  const parts = line.split(/\s+and\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [classifyLine(line, sourceField)];
  const checks = parts.map((part) => classifyLine(part, sourceField));
  const kinds = new Set(checks.map((check) => check.kind));
  if (kinds.size === 1 && checks[0]?.kind === "prose") return [classifyLine(line, sourceField)];
  return checks;
}

function classifyLine(line: string, sourceField: RequirementCheck["sourceField"]): RequirementCheck {
  const years = line.match(/(\d+)\s*[–-]\s*(\d+)\s*\+?\s*years/i) ?? line.match(/(\d+)\+?\s*years/i);
  if (years) {
    const minYears = Number(years[1]);
    const maxYears = years[2] ? Number(years[2]) : null;
    return { sourceField, kind: "years", text: line, minYears, maxYears: maxYears ?? undefined };
  }
  const skill = skillInLine(line);
  if (skill) return { sourceField, kind: "skill", text: line, skill };
  const domain = DOMAIN_WORDS.find((word) => line.toLowerCase().includes(word));
  if (domain) return { sourceField, kind: "domain", text: line, skill: domain };
  return { sourceField, kind: "prose", text: line };
}

function skillInLine(line: string) {
  const tokens = line.split(/[^A-Za-z0-9+#.]+/).filter((token) => token.length >= 2);
  for (const token of tokens) {
    const resolved = resolveSkillAlias(token);
    if (resolved) return resolved.canonicalKey;
  }
  const named = line.match(/\b(gRPC|GraphQL|SQL|REST)\b/);
  return named ? named[1].toLowerCase() : null;
}

export function yearsInResume(text: string) {
  const match = text.match(/(\d+)\+?\s*years/i);
  return match ? Number(match[1]) : null;
}

const QUOTE_PROMPT_VERSION = "requirement-quotes-1";
const QUOTE_MODEL = "gpt-4o-mini";

export async function quotesForVagueRequirements(
  resumeText: string,
  lines: string[],
  scope?: { companyId: number; applicationId: number } | null,
) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || lines.length === 0 || !resumeText.trim()) return [] as string[];
  if (scope) {
    try {
      await assertAIEvaluationAllowed({ applicationId: scope.applicationId });
    } catch {
      return [];
    }
  }
  const system = "Decide whether each requirement is supported by the resume. Return a quote copied exactly from the resume, or null. Do not paraphrase.";
  const user = JSON.stringify({ resume: resumeText.slice(0, 8000), requirements: lines });
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      quotes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            requirement: { type: "string" },
            quote: { type: ["string", "null"] },
          },
          required: ["requirement", "quote"],
        },
      },
    },
    required: ["quotes"],
  };
  const completed = await withAIRun(
    "requirement_quotes",
    null,
    scope
      ? {
          companyId: scope.companyId,
          entityType: "Application",
          entityId: scope.applicationId,
          model: QUOTE_MODEL,
          promptVersion: QUOTE_PROMPT_VERSION,
          input: { system, user },
        }
      : null,
    async () => {
      const value = await completeStructured({
        feature: "requirement_quotes",
        model: QUOTE_MODEL,
        promptVersion: QUOTE_PROMPT_VERSION,
        system,
        user,
        schemaName: "requirement_quotes",
        schema,
        apiKey: key,
        maxRetries: 0,
      });
      return {
        value,
        promptTokens: value.promptTokens,
        completionTokens: value.completionTokens,
        output: value.parsed,
      };
    },
  );
  const parsed = completed.parsed as { quotes?: Array<{ requirement?: string; quote?: string | null }> };
  return (parsed.quotes ?? []).flatMap((row) => {
    if (!row.quote || !resumeText.includes(row.quote)) return [];
    return [row.requirement ?? ""];
  });
}

const SQL_DATABASES = ["postgresql", "postgres", "mysql"];

/** SQL is inferred from a named database already written in the resume. */
export function inferredSqlDatabase(resumeText: string) {
  const lower = resumeText.toLowerCase();
  return SQL_DATABASES.find((name) => lower.includes(name)) ?? null;
}

export function yearsCheckPasses(check: RequirementCheck, resumeText: string) {
  const years = yearsInResume(resumeText);
  if (years === null || check.minYears === undefined) return false;
  if (years < check.minYears) return false;
  if (check.maxYears !== undefined && years > check.maxYears) return false;
  return true;
}
