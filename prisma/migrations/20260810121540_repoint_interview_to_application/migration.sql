/*
  Warnings:

  - You are about to drop the column `candidateId` on the `Interview` table. All the data in the column will be lost.
  - Added the required column `applicationId` to the `Interview` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Interview" DROP CONSTRAINT "Interview_candidateId_fkey";

-- DropIndex
DROP INDEX "public"."Interview_candidateId_idx";

-- AlterTable
ALTER TABLE "Interview" DROP COLUMN "candidateId",
ADD COLUMN     "applicationId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Interview_applicationId_idx" ON "Interview"("applicationId");

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
