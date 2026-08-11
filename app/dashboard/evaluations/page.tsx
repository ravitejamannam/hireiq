import EvaluationsClient from "@/components/evaluations/EvaluationsClient";
import { getApplications } from "@/lib/repositories/application-repository";
import { getEvaluations } from "@/lib/repositories/evaluation-repository";
import { getInterviewers } from "@/lib/repositories/interviewer-repository";

export default async function EvaluationsPage() {
  const [evaluations, applications, interviewers] = await Promise.all([
    getEvaluations(),
    getApplications(),
    getInterviewers(),
  ]);

  return (
    <EvaluationsClient
      initialEvaluations={evaluations}
      applications={applications}
      interviewers={interviewers}
    />
  );
}
