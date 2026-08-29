import {
  EMPLOYMENT_TYPES,
  employmentTypeLabels,
  type EmploymentType,
} from "@/lib/jobs/job-posting-view";
import type { CanonicalJobPosting } from "@/lib/jobs/public-feed/canonical-job";

export type CareersSort = "newest" | "title";

export type CareersQuery = {
  location?: string;
  employmentType?: string;
  sort?: string;
};

export type PublicCareersRole = CanonicalJobPosting & {
  employmentType: EmploymentType | null;
  employmentTypeLabel: string | null;
  applicationCount: number | null;
};

export function parseCareersEmploymentType(
  value: string | undefined,
): EmploymentType | null {
  if (!value) return null;
  return EMPLOYMENT_TYPES.includes(value as EmploymentType)
    ? (value as EmploymentType)
    : null;
}

export function parseCareersSort(value: string | undefined): CareersSort {
  return value === "title" ? "title" : "newest";
}

export function filterAndSortCareersRoles(
  roles: PublicCareersRole[],
  query: CareersQuery,
): PublicCareersRole[] {
  const location = query.location?.trim().toLowerCase() ?? "";
  const employmentType = parseCareersEmploymentType(query.employmentType);
  const sort = parseCareersSort(query.sort);

  const filtered = roles.filter((role) => {
    if (location) {
      const haystack = (role.location ?? "").toLowerCase();
      if (!haystack.includes(location)) return false;
    }
    if (employmentType && role.employmentType !== employmentType) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered];
  if (sort === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    sorted.sort((a, b) => b.datePosted.getTime() - a.datePosted.getTime());
  }
  return sorted;
}

export function uniqueCareersLocations(roles: PublicCareersRole[]): string[] {
  const values = new Set<string>();
  for (const role of roles) {
    const location = role.location?.trim();
    if (location) values.add(location);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function uniqueCareersEmploymentTypes(
  roles: PublicCareersRole[],
): Array<{ value: EmploymentType; label: string }> {
  const values = new Set<EmploymentType>();
  for (const role of roles) {
    if (role.employmentType) values.add(role.employmentType);
  }
  return EMPLOYMENT_TYPES.filter((value) => values.has(value)).map((value) => ({
    value,
    label: employmentTypeLabels[value],
  }));
}
