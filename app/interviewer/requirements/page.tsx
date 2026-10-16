import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Requirements",
};

import InterviewerRequirementsClient from "@/components/interviewer/InterviewerRequirementsClient";
import { getInterviewerAssignedJobs } from "@/lib/repositories/interviewer-portal-repository";

export default async function InterviewerRequirementsPage() {
  const requirements = await getInterviewerAssignedJobs();

  return <InterviewerRequirementsClient requirements={requirements} />;
}
