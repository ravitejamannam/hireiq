import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Interviewers",
};

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import InterviewersClient from "@/components/interviewers/InterviewersClient";
import { getInterviewers } from "@/lib/repositories/interviewer-repository";

export default async function InterviewersPage() {
  const interviewers = await getInterviewers();

  return (
    <DashboardLayout>
      <InterviewersClient initialInterviewers={interviewers} />
    </DashboardLayout>
  );
}
