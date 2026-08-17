-- T79: Organization membership, invitations, and email verification.
-- Inspected live data before backfill:
--   every CLIENT had exactly one companyId
--   no company had multiple CLIENT users
--   ADMIN and INTERVIEWER had companyId NULL
-- CASE A: the single CLIENT per company becomes ACTIVE OWNER.
-- CASE B: abort if any company has more than one CLIENT (owner would be ambiguous).

-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "OrganizationMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL,
    "status" "OrganizationMemberStatus" NOT NULL,
    "invitedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_companyId_userId_key" ON "OrganizationMember"("companyId", "userId");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_status_idx" ON "OrganizationMember"("userId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMember_companyId_status_idx" ON "OrganizationMember"("companyId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMember_companyId_role_status_idx" ON "OrganizationMember"("companyId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_companyId_email_idx" ON "Invitation"("companyId", "email");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- Partial unique: one ACTIVE OWNER per company
CREATE UNIQUE INDEX "OrganizationMember_one_active_owner_per_company"
ON "OrganizationMember" ("companyId")
WHERE "role" = 'OWNER'
AND "status" = 'ACTIVE';

-- Partial unique: one ACTIVE membership per user (T79 one-company policy)
CREATE UNIQUE INDEX "OrganizationMember_one_active_membership_per_user"
ON "OrganizationMember" ("userId")
WHERE "status" = 'ACTIVE';

-- Partial unique: one pending invitation per company + email
CREATE UNIQUE INDEX "Invitation_one_pending_per_company_email"
ON "Invitation" ("companyId", "email")
WHERE "acceptedAt" IS NULL
AND "revokedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing users already have V1 credentials; keep V1QA functional.
UPDATE "User" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;

-- CASE B guard: do not invent an OWNER when multiple CLIENT users share a company.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "role" = 'CLIENT'
      AND "companyId" IS NOT NULL
    GROUP BY "companyId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'T79 migration aborted: multiple CLIENT users share a company; OWNER is ambiguous';
  END IF;
END $$;

-- CASE A: exactly one CLIENT per company becomes ACTIVE OWNER.
-- CASE C: CLIENT with NULL companyId is skipped.
-- CASE D/E: ADMIN and INTERVIEWER are not inserted.
INSERT INTO "OrganizationMember" ("companyId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT "companyId", "id", 'OWNER', 'ACTIVE', NOW(), NOW()
FROM "User"
WHERE "role" = 'CLIENT'
  AND "companyId" IS NOT NULL;
