import "dotenv/config";

import { hashPassword, verifyPassword } from "../lib/auth/password";
import { prisma } from "../lib/prisma";

const email = (process.env.ADMIN_EMAIL || "admin@hireiq.local").trim().toLowerCase();
const password = process.env.BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD || "";

async function main() {
  if (!password) {
    console.error("Missing BOOTSTRAP_PASSWORD or ADMIN_PASSWORD.");
    process.exit(1);
  }
  const found = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, companyId: true, disabledAt: true, emailVerifiedAt: true, passwordHash: true },
  });
  const fallback = found ?? await prisma.user.findFirst({
    where: { role: "ADMIN", disabledAt: null },
    select: { id: true, email: true, role: true, companyId: true, disabledAt: true, emailVerifiedAt: true, passwordHash: true },
  });
  const user = fallback;
  if (!user) {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true, disabledAt: true }, take: 10 });
    console.error(JSON.stringify({ missing: email, admins }));
    process.exit(1);
  }
  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        disabledAt: null,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
  }
  const invites = await prisma.assessmentInvite.count();
  const allowed = await prisma.assessmentInvite.count({ where: { aiUsePolicy: "AI_ALLOWED" } });
  console.log(JSON.stringify({
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    passwordMatched: matches,
    passwordReset: !matches,
    assessmentInvites: invites,
    aiAllowedInvites: allowed,
  }));
}

main().finally(() => prisma.$disconnect());
