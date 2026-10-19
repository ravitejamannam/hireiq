import "dotenv/config";

/**
 * Idempotent admin bootstrap for HireIQ development.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... pnpm db:bootstrap-admin
 *
 * Does not create an admin merely because the database is empty.
 * Never prints the password.
 */

import { PortalRole } from "@prisma/client";

import { hashPassword, verifyPassword } from "../lib/auth/password";
import { prisma } from "../lib/prisma";
import {
  UserValidationError,
  validateBootstrapPassword,
} from "../lib/validation/user-validation";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function bootstrapAdmin() {
  const emailRaw = process.env.ADMIN_EMAIL;
  const nameRaw = process.env.ADMIN_NAME;
  const passwordRaw = process.env.ADMIN_PASSWORD;

  if (!emailRaw?.trim() || !nameRaw?.trim() || !passwordRaw) {
    console.error(
      "Missing required environment variables: ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD",
    );
    process.exit(1);
  }

  const email = normalizeEmail(emailRaw);
  const name = nameRaw.trim();

  try {
    validateBootstrapPassword(passwordRaw);
  } catch (error) {
    if (error instanceof UserValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    console.error("ADMIN_EMAIL is invalid.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, email: true },
  });

  if (existing) {
    const stored = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true, emailVerifiedAt: true },
    });
    const matches = stored ? await verifyPassword(passwordRaw, stored.passwordHash) : false;
    if (!matches) {
      await prisma.user.update({
        where: { email },
        data: {
          passwordHash: await hashPassword(passwordRaw),
          passwordChangedAt: new Date(),
          emailVerifiedAt: stored?.emailVerifiedAt ?? new Date(),
        },
      });
      console.log(
        `Admin password updated to ADMIN_PASSWORD (${existing.email}). The previous hash did not match.`,
      );
      return;
    }
    console.log(
      `Admin bootstrap skipped: user already exists (${existing.email}, role=${existing.role}).`,
    );
    return;
  }

  const passwordHash = await hashPassword(passwordRaw);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: PortalRole.ADMIN,
      passwordHash,
      companyId: null,
      interviewerId: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  console.log(
    `Admin user created: id=${user.id} email=${user.email} role=${user.role}`,
  );
}

bootstrapAdmin()
  .catch((error) => {
    console.error("Admin bootstrap failed.");
    if (error instanceof Error && !(error.message.includes("password"))) {
      console.error(error.message);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
