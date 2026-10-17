import { prisma } from "@/lib/prisma";

/**
 * Owners may always confirm hire.
 * Members may confirm only when the company explicitly enables it.
 */
export async function clientMayConfirmHire(client: {
  companyId: number;
  membershipRole: "OWNER" | "MEMBER";
}) {
  if (client.membershipRole === "OWNER") {
    return true;
  }

  const company = await prisma.company.findUnique({
    where: { id: client.companyId },
    select: { membersCanConfirmHire: true },
  });

  return company?.membersCanConfirmHire === true;
}
