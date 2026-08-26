-- T131: programmatic bidding seam (Appcast-style). Null = organic only.
ALTER TABLE "JobDistribution" ADD COLUMN "dailyBudgetCents" INTEGER;
ALTER TABLE "JobDistribution" ADD COLUMN "cpcBidCents" INTEGER;
