import TechnicalEvaluationsClient from "@/components/technical-evaluations/TechnicalEvaluationsClient";
import { getTechnicalEvaluationApplications } from "@/lib/repositories/application-repository";

export default async function TechnicalEvaluationsPage() {
  const applications = await getTechnicalEvaluationApplications();

  return <TechnicalEvaluationsClient initialApplications={applications} />;
}
