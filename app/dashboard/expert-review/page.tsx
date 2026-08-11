import ExpertReviewClient from "@/components/expert-review/ExpertReviewClient";
import { getExpertReviewApplications } from "@/lib/repositories/application-repository";

export default async function ExpertReviewPage() {
  const applications = await getExpertReviewApplications();

  return <ExpertReviewClient initialApplications={applications} />;
}
