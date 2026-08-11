import { getShortlistApplications } from "@/lib/repositories/application-repository";
import ShortlistClient from "@/components/shortlist/ShortlistClient";

export default async function ShortlistPage() {
  const applications = await getShortlistApplications();

  return <ShortlistClient initialApplications={applications} />;
}
