import ReportsClient from "@/components/reports/ReportsClient";
import { getApplications } from "@/lib/repositories/application-repository";
import { getReports } from "@/lib/repositories/report-repository";

export default async function ReportsPage() {
  const [reports, applications] = await Promise.all([
    getReports(),
    getApplications(),
  ]);

  return (
    <ReportsClient initialReports={reports} applications={applications} />
  );
}
