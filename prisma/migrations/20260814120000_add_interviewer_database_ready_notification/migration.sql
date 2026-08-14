-- Distinct T69 database-ready communication event.
-- Keeps T68 INTERVIEWER_REQUIREMENT_READY unchanged.
-- Notification uniqueness remains @@unique([jobId, interviewerId, type]).

ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEWER_DATABASE_READY';
