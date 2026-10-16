import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidates",
};

import CandidatesClient from "@/components/candidates/CandidatesClient";
import { getCandidates } from "@/lib/repositories/candidate-repository";
import { getCompanies } from "@/lib/repositories/company-repository";

export default async function CandidatesPage() {
  const [candidates, companies] = await Promise.all([getCandidates(), getCompanies()]);

  return <CandidatesClient initialCandidates={candidates} companies={companies} />;
}