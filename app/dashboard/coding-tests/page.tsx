import CodingTestsClient from "@/components/coding-tests/CodingTestsClient";
import { getApplications } from "@/lib/repositories/application-repository";
import { getCodingTests } from "@/lib/repositories/coding-test-repository";

export default async function CodingTestsPage() {
  const [codingTests, applications] = await Promise.all([
    getCodingTests(),
    getApplications(),
  ]);

  return (
    <CodingTestsClient
      initialCodingTests={codingTests}
      applications={applications}
    />
  );
}
