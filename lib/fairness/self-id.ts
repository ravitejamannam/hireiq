import { prisma } from "@/lib/prisma";

export const SELF_ID_FIELDS = ["gender", "ageBand", "disability", "region"] as const;
export const PREFER_NOT = "prefer_not";

const GENDER = new Set(["woman", "man", "non_binary", PREFER_NOT]);
const AGE = new Set(["under_25", "25_34", "35_44", "45_plus", PREFER_NOT]);
const DISABILITY = new Set(["yes", "no", PREFER_NOT]);

export type SelfIdInput = {
  candidateId: number;
  companyId: number;
  gender?: string;
  ageBand?: string;
  disability?: string;
  region?: string;
};

function choice(value: string | undefined, allowed: Set<string>) {
  if (!value || !allowed.has(value)) return PREFER_NOT;
  return value;
}

export async function saveSelfIdentification(input: SelfIdInput) {
  const data = {
    companyId: input.companyId,
    gender: choice(input.gender, GENDER),
    ageBand: choice(input.ageBand, AGE),
    disability: choice(input.disability, DISABILITY),
    region: input.region?.trim() ? input.region.trim().slice(0, 80) : PREFER_NOT,
    consentedAt: new Date(),
  };
  return prisma.candidateSelfIdentification.upsert({
    where: { candidateId: input.candidateId },
    create: { candidateId: input.candidateId, ...data },
    update: data,
  });
}

export async function readSelfIdentification(candidateId: number) {
  return prisma.candidateSelfIdentification.findUnique({ where: { candidateId } });
}

export async function deleteSelfIdentification(candidateId: number) {
  await prisma.candidateSelfIdentification.deleteMany({ where: { candidateId } });
}

export async function selfIdentificationsForCompany(companyId: number) {
  return prisma.candidateSelfIdentification.findMany({ where: { companyId } });
}
