-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_applicationId_interviewerId_key" ON "Evaluation"("applicationId", "interviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_jobId_interviewerId_type_key" ON "Notification"("jobId", "interviewerId", "type");
