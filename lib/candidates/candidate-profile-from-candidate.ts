import type { CandidateMaterializeSource } from "@/lib/candidates/candidate-profile-types";

/**
 * Safe T89 materialization payload.
 *
 * Copies only descriptive Candidate columns. Does NOT copy:
 * - role (T85–T87 may store Job.title)
 * - status (pipeline leftover)
 * - name (stays on Candidate)
 * - email/phone (do not exist on Candidate)
 */
export function profileCreateDataFromCandidate(
  candidate: CandidateMaterializeSource,
) {
  return {
    candidateId: candidate.id,
    companyId: candidate.companyId,
    headline: null as string | null,
    location: candidate.location,
    experienceYears: candidate.experienceYears,
    skillsText: candidate.skills,
    currentEmployer: candidate.currentEmployer,
    expectedCTC: candidate.expectedCTC,
    linkedInUrl: null as string | null,
  };
}
