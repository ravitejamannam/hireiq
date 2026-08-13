import { PortalRole } from "@prisma/client";

export function homePathForRole(role: PortalRole) {
  if (role === PortalRole.CLIENT) {
    return "/client";
  }

  if (role === PortalRole.INTERVIEWER) {
    return "/interviewer";
  }

  return "/dashboard";
}
