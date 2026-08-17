type OwnerLookupDb = {
  organizationMember: {
    findFirst: (args: {
      where: {
        companyId: number;
        role: "OWNER";
        status: "ACTIVE";
      };
      orderBy: { userId: "asc" };
      select: {
        user: {
          select: { email: true };
        };
      };
    }) => Promise<{ user: { email: string } } | null>;
  };
};

/**
 * T70 recipient: ACTIVE OWNER email for the Job's company.
 * Never accepts companyId/userId/email from the caller beyond the Job lookup.
 */
export async function findActiveOwnerEmail(
  companyId: number,
  db: OwnerLookupDb,
): Promise<string | null> {
  const owner = await db.organizationMember.findFirst({
    where: {
      companyId,
      role: "OWNER",
      status: "ACTIVE",
    },
    orderBy: {
      userId: "asc",
    },
    select: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  const email = owner?.user.email?.trim();
  return email ? email : null;
}
