import "dotenv/config";

import { prisma } from "../lib/prisma";

async function main() {
  const company = await prisma.company.findFirst({ where: { publicSlug: "nimbus" }, select: { id: true } });
  if (!company) throw new Error("Nimbus company is missing.");
  const existing = await prisma.outreachSequence.findFirst({ where: { companyId: company.id, name: "Backend follow-up" }, select: { id: true } });
  if (!existing) {
    await prisma.outreachSequence.create({
      data: {
        companyId: company.id,
        name: "Backend follow-up",
        steps: {
          create: {
            position: 0,
            subject: "Following up on the backend role",
            body: "This draft stays unsent until a recruiter approves it.",
          },
        },
      },
    });
  }
  const invite = await prisma.assessmentInvite.findFirst({
    where: { application: { companyId: company.id } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  if (invite) {
    await prisma.assessmentInvite.update({ where: { id: invite.id }, data: { aiUsePolicy: "AI_ALLOWED" } });
  }
  console.log(JSON.stringify({ companyId: company.id, sequence: true, inviteUpdated: Boolean(invite) }));
}

main().finally(() => prisma.$disconnect());
