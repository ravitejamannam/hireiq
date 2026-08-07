import CompaniesClient from "@/components/companies/CompaniesClient";
import { getCompanies } from "@/lib/repositories/company-repository";

export default async function CompaniesPage() {
  const companies = await getCompanies();

  return <CompaniesClient initialCompanies={companies} />;
}