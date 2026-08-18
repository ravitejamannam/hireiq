/**
 * Operational label for T95 job-scoped capture behavior.
 * Not persisted: CandidateEvidence.createdAt remains the artifact timestamp.
 * No EvidenceCaptureRun table — T91 uniqueness is sufficient for retries.
 */
export const CAPTURE_POLICY_VERSION = "v1";
