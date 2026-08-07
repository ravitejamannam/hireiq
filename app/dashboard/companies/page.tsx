import CompaniesClient from "@/components/companies/CompaniesClient";
import { prisma } from "@/lib/prisma";


export default async function CompaniesPage() {
  
  const companies = await prisma.company.findMany();


  return <CompaniesClient initialCompanies={companies} />;
}