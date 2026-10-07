import { PortalRole } from "@prisma/client";

export function isAdminM11Role(role: PortalRole) {
  return role === PortalRole.ADMIN;
}

export function validateM11PositiveId(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}
