import InterviewsClient from "@/components/interviews/InterviewsClient";
import { getApplications } from "@/lib/repositories/application-repository";
import { getInterviews } from "@/lib/repositories/interview-repository";

export default async function InterviewsPage() {
  const [interviews, applications] = await Promise.all([
    getInterviews(),
    getApplications(),
  ]);

  return (
    <InterviewsClient
      initialInterviews={interviews}
      applications={applications}
    />
  );
}
