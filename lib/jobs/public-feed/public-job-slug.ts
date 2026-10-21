import { isValidPublicSlug } from "@/lib/companies/public-slug";

const SLUG_TITLE_LENGTH = 48;

export function publicJobSlug(title: string, distributionId: number) {
  if (!Number.isInteger(distributionId) || distributionId <= 0) {
    throw new Error("Distribution id is required to build a public job slug.");
  }
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_TITLE_LENGTH)
    .replace(/-+$/g, "");
  return `${base || "role"}-${distributionId}`;
}

export function distributionIdFromPublicSlug(slug: string): number | null {
  const match = slug.match(/-(\d+)$/);
  if (!match) return null;
  const id = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rebuiltPrefix = slug.slice(0, -(match[1]!.length + 1));
  if (rebuiltPrefix && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rebuiltPrefix)) {
    return null;
  }
  return id;
}

/** Join a configured or browser origin to a path. An empty origin keeps the path relative. */
export function prefixPublicOrigin(origin: string, path: string) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const base = origin.trim().replace(/\/$/, "");
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : path.startsWith("/") ? path : `/${path}`;
}

export function publicCompanyJobsPath(companySlug: string) {
  return `/c/${companySlug}/jobs`;
}

export function publicJobPath(
  companySlug: string,
  title: string,
  distributionId: number,
) {
  return `/c/${companySlug}/jobs/${publicJobSlug(title, distributionId)}`;
}

export function companySlugMatches(urlSlug: string, jobSlug: string) {
  return isValidPublicSlug(urlSlug) && urlSlug === jobSlug;
}
