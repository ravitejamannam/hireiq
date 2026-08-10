/*
  Warnings:

  - You are about to drop the column `candidateId` on the `CodingTest` table. All the data in the column will be lost.
  - You are about to drop the column `candidateId` on the `Report` table. All the data in the column will be lost.
  - Added the required column `applicationId` to the `CodingTest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `applicationId` to the `Report` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."CodingTest" DROP CONSTRAINT "CodingTest_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Report" DROP CONSTRAINT "Report_candidateId_fkey";

-- DropIndex
DROP INDEX "public"."CodingTest_candidateId_idx";

-- DropIndex
DROP INDEX "public"."Report_candidateId_key";

-- AlterTable
ALTER TABLE "CodingTest" DROP COLUMN "candidateId",
ADD COLUMN     "applicationId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Report" DROP COLUMN "candidateId",
ADD COLUMN     "applicationId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "CodingTest_applicationId_idx" ON "CodingTest"("applicationId");

-- CreateIndex
CREATE INDEX "Report_applicationId_idx" ON "Report"("applicationId");

-- AddForeignKey
ALTER TABLE "CodingTest" ADD CONSTRAINT "CodingTest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
