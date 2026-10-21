import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { isValidPublicSlug } from "@/lib/companies/public-slug-rules";
import { prisma } from "@/lib/prisma";

const BASE_SLUG_LENGTH = 48;
const MAX_SLUG_LENGTH = 64;

export { isValidPublicSlug };

type Db = Prisma.TransactionClient | typeof prisma;

export function slugifyCompanyName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BASE_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return normalized || "company";
}

export function publicCareersPath(companySlug: string): string {
  return `/careers/${companySlug}`;
}

export async function allocateCompanyPublicSlug(
  name: string,
  db: Db = prisma,
): Promise<string> {
  const base = slugifyCompanyName(name);

  for (let index = 0; index < 24; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    if (candidate.length > MAX_SLUG_LENGTH) {
      continue;
    }
    const taken = await db.company.findUnique({
      where: { publicSlug: candidate },
      select: { id: true },
    });
    if (!taken) {
      return candidate;
    }
  }

  return `${base.slice(0, BASE_SLUG_LENGTH - 9)}-${randomBytes(4).toString("hex")}`;
}
