-- Additive only. Null keeps the existing behaviour (any open slot of the job).
-- A walkthrough link sets it to 10 so the server refuses any other duration.
ALTER TABLE "InterviewBookingInvite" ADD COLUMN "requiredDurationMinutes" INTEGER;
