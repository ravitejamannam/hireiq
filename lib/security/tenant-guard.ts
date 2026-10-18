/** Same-company check used before returning a row looked up by id. */
export function sameCompany(actorCompanyId: number | null, resourceCompanyId: number | null) {
  if (actorCompanyId == null) return true;
  return actorCompanyId === resourceCompanyId;
}

export function rejectCrossTenant(actorCompanyId: number | null, resourceCompanyId: number | null) {
  if (sameCompany(actorCompanyId, resourceCompanyId)) return null;
  return { status: 404 as const, error: "Not found." };
}
