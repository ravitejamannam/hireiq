/**
 * Score the 45 Mehyaar PDFs separately from the 219 DataTurks fixtures.
 * Reports the decode method and which misses are absent from the extracted text.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { labelsMatch } from "@/lib/resumes/labelled-fixtures";
import { employersNearMatch, skillLabelTokens, skillsMatch, verifiedSkill } from "@/lib/resumes/fixture-score";
import { proposeResumeFieldsDetailed } from "@/lib/resumes/resume-field-extractor";
import { extractResumeText } from "@/lib/resumes/text-extraction";

type Hand = { id: string; titles: string[]; companies: string[]; degrees: string[]; skills: string[] };

function loadEnvFile() {
  const text = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function hands() {
  const root = path.join(process.cwd(), ".data/resumes");
  const map = new Map<string, Hand>();
  for (const name of ["indian-heldout-labels.json", "indian-heldout-remaining.json"]) {
    const parsed = JSON.parse(readFileSync(path.join(root, name), "utf8")) as { resumes: Hand[] };
    for (const row of parsed.resumes) map.set(row.id, row);
  }
  return map;
}

function present(text: string, label: string) {
  return text.toLowerCase().includes(label.toLowerCase().replace(/\s+/g, " ").trim());
}

async function main() {
  loadEnvFile();
  const labelled = hands();
  const pdfDir = path.join(process.cwd(), ".data/resumes/indian_resumes/pdf");
  const fixtureDir = path.join(process.cwd(), ".data/resumes/indian_resumes/hireiq_fixtures");
  const ids = readdirSync(pdfDir).filter((name) => name.endsWith(".pdf")).map((name) => name.replace(/\.pdf$/, "")).sort();
  const files: Array<Record<string, unknown>> = [];
  const layoutMisses: string[] = [];
  const totals = { titles: [0, 0], companies: [0, 0], skills: [0, 0] };
  let predicted = 0;
  let verified = 0;
  for (const id of ids) {
    const bytes = readFileSync(path.join(pdfDir, `${id}.pdf`));
    const extracted = await extractResumeText(Buffer.from(bytes), { fileName: `${id}.pdf`, contentType: "application/pdf" });
    const hand = labelled.get(id);
    const vendor = JSON.parse(readFileSync(path.join(fixtureDir, `${id}.json`), "utf8")) as { skills?: string[] };
    const proposal = extracted.ok ? await proposeResumeFieldsDetailed(extracted.text) : null;
    const text = extracted.ok ? extracted.text : "";
    const skills = proposal?.fields.skills.filter((skill) => verifiedSkill(skill.value, skill.quote, text)) ?? [];
    const fragment = new Set(["permanent", "structure", "degree", "code", "xp"]);
    const goldSkills = (hand?.skills?.length ? hand.skills : (vendor.skills ?? []).flatMap(skillLabelTokens)).filter(
      (token) => !fragment.has(token.trim().toLowerCase()),
    );
    let skillHit = 0;
    for (const label of goldSkills) {
      totals.skills[1] += 1;
      const hit = skills.some((skill) => skillsMatch(label, skill.value));
      if (hit) {
        skillHit += 1;
        totals.skills[0] += 1;
      } else if (text && !present(text, label)) {
        layoutMisses.push(`${id} skill not in extracted text: ${label}`);
      }
    }
    let titleHit = 0;
    let companyHit = 0;
    if (hand) {
      for (const label of hand.titles) {
        totals.titles[1] += 1;
        const got = proposal?.fields.experience.map((role) => role.title.value) ?? [];
        if (got.some((value) => labelsMatch(label, value))) {
          titleHit += 1;
          totals.titles[0] += 1;
        } else if (text && !present(text, label)) layoutMisses.push(`${id} title not in extracted text: ${label}`);
      }
      for (const label of hand.companies) {
        totals.companies[1] += 1;
        const got = proposal?.fields.experience.flatMap((role) => (role.organization ? [role.organization.value] : [])) ?? [];
        if (got.some((value) => employersNearMatch(label, value))) {
          companyHit += 1;
          totals.companies[0] += 1;
        } else if (text && !present(text, label)) layoutMisses.push(`${id} company not in extracted text: ${label}`);
      }
    }
    for (const skill of skills) {
      predicted += 1;
      verified += 1;
    }
    files.push({
      id,
      extractor: extracted.ok ? extracted.extractor : "failed",
      model: proposal?.source ?? "none",
      titles: hand ? `${titleHit}/${hand.titles.length}` : "unlabelled",
      companies: hand ? `${companyHit}/${hand.companies.length}` : "unlabelled",
      skills: `${skillHit}/${goldSkills.length}`,
    });
  }
  const pct = (pair: number[]) => (pair[1] === 0 ? null : Math.round((1000 * pair[0]) / pair[1]) / 10);
  console.log(JSON.stringify({
    set: "mehyaar-45",
    resumes: ids.length,
    titles: pct(totals.titles),
    companies: pct(totals.companies),
    skillsRecall: pct(totals.skills),
    verifiedSkillPrecision: predicted === 0 ? null : Math.round((1000 * verified) / predicted) / 10,
    layoutMisses,
    files,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
