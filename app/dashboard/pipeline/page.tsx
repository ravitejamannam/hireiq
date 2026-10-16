import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pipeline",
};

import PipelineClient from "@/components/pipeline/PipelineClient";
import { getApplications } from "@/lib/repositories/application-repository";

export default async function PipelinePage() {
  const applications = await getApplications();

  return <PipelineClient initialApplications={applications} />;
}
