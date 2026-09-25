-- Additive Job Intelligence, Requirement Graph, skill aliases, claim polarity,
-- and Matcher V2. Does not alter CandidateMatchResult or V1 match rows.

ALTER TYPE "CandidateIntelligenceExtractorType" ADD VALUE 'DETERMINISTIC_TEXT_V1';

CREATE TYPE "JobIntelligenceRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "JobIntelligenceExtractorType" AS ENUM ('DETERMINISTIC_SPEC_V1');
CREATE TYPE "JobRequirementCategory" AS ENUM ('HARD_CONSTRAINT', 'REQUIRED', 'PREFERRED', 'RESPONSIBILITY', 'CONSTRAINT', 'AMBIGUOUS');
CREATE TYPE "JobRequirementUncertainty" AS ENUM ('CERTAIN', 'AMBIGUOUS');
CREATE TYPE "SkillAliasRelationshipType" AS ENUM ('ALIAS');
CREATE TYPE "CandidateClaimPolarity" AS ENUM ('POSITIVE', 'NEGATED', 'UNCERTAIN');
CREATE TYPE "RequirementSupportState" AS ENUM ('SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNKNOWN', 'CONTRADICTED', 'UNSUPPORTED');
CREATE TYPE "RequirementAssessmentRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

ALTER TABLE "CandidateClaim" ADD COLUMN "sourceSpanStart" INTEGER;
ALTER TABLE "CandidateClaim" ADD COLUMN "sourceSpanEnd" INTEGER;
ALTER TABLE "CandidateClaim" ADD COLUMN "polarity" "CandidateClaimPolarity" NOT NULL DEFAULT 'POSITIVE';

CREATE TABLE "SkillConcept" (
    "id" SERIAL NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "ontologyVersion" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillConcept_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillAlias" (
    "id" SERIAL NOT NULL,
    "conceptId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "relationshipType" "SkillAliasRelationshipType" NOT NULL,
    "ontologyVersion" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobIntelligenceRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "status" "JobIntelligenceRunStatus" NOT NULL,
    "extractorType" "JobIntelligenceExtractorType" NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    CONSTRAINT "JobIntelligenceRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobRequirement" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "stableKey" TEXT NOT NULL,
    "sourceField" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceSpanStart" INTEGER,
    "sourceSpanEnd" INTEGER,
    "category" "JobRequirementCategory" NOT NULL,
    "normalizedValue" TEXT,
    "skillConceptId" INTEGER,
    "provenance" TEXT NOT NULL,
    "uncertainty" "JobRequirementUncertainty" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RequirementAssessmentRun" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "jobId" INTEGER NOT NULL,
    "jobSpecificationVersionId" INTEGER NOT NULL,
    "jobIntelligenceRunId" INTEGER NOT NULL,
    "status" "RequirementAssessmentRunStatus" NOT NULL,
    "matcherVersion" TEXT NOT NULL,
    "ontologyVersion" TEXT NOT NULL,
    "intelligenceSnapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    CONSTRAINT "RequirementAssessmentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RequirementAssessment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "jobRequirementId" INTEGER NOT NULL,
    "supportState" "RequirementSupportState" NOT NULL,
    "method" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "claimId" INTEGER,
    "evidenceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequirementAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SkillConcept_ontologyVersion_canonicalKey_key" ON "SkillConcept"("ontologyVersion", "canonicalKey");
CREATE INDEX "SkillConcept_active_idx" ON "SkillConcept"("active");
CREATE UNIQUE INDEX "SkillAlias_ontologyVersion_normalizedAlias_key" ON "SkillAlias"("ontologyVersion", "normalizedAlias");
CREATE INDEX "SkillAlias_conceptId_idx" ON "SkillAlias"("conceptId");
CREATE INDEX "SkillAlias_active_idx" ON "SkillAlias"("active");

CREATE UNIQUE INDEX "JobIntelligenceRun_id_companyId_key" ON "JobIntelligenceRun"("id", "companyId");
CREATE INDEX "JobIntelligenceRun_companyId_jobId_createdAt_idx" ON "JobIntelligenceRun"("companyId", "jobId", "createdAt");
CREATE INDEX "JobIntelligenceRun_companyId_jobSpecificationVersionId_createdAt_idx" ON "JobIntelligenceRun"("companyId", "jobSpecificationVersionId", "createdAt");
CREATE UNIQUE INDEX "JobIntelligenceRun_completed_idempotency_key"
ON "JobIntelligenceRun" ("companyId", "jobSpecificationVersionId", "extractorType", "extractorVersion", "inputHash")
WHERE "status" = 'COMPLETED';

CREATE UNIQUE INDEX "JobRequirement_id_companyId_key" ON "JobRequirement"("id", "companyId");
CREATE UNIQUE INDEX "JobRequirement_runId_stableKey_key" ON "JobRequirement"("runId", "stableKey");
CREATE INDEX "JobRequirement_companyId_jobSpecificationVersionId_idx" ON "JobRequirement"("companyId", "jobSpecificationVersionId");
CREATE INDEX "JobRequirement_companyId_runId_idx" ON "JobRequirement"("companyId", "runId");
CREATE INDEX "JobRequirement_skillConceptId_idx" ON "JobRequirement"("skillConceptId");

CREATE UNIQUE INDEX "RequirementAssessmentRun_id_companyId_key" ON "RequirementAssessmentRun"("id", "companyId");
CREATE INDEX "RequirementAssessmentRun_companyId_applicationId_createdAt_idx" ON "RequirementAssessmentRun"("companyId", "applicationId", "createdAt");
CREATE INDEX "RequirementAssessmentRun_companyId_jobSpecificationVersionId_createdAt_idx" ON "RequirementAssessmentRun"("companyId", "jobSpecificationVersionId", "createdAt");
CREATE UNIQUE INDEX "RequirementAssessmentRun_completed_idempotency_key"
ON "RequirementAssessmentRun" ("companyId", "applicationId", "jobSpecificationVersionId", "jobIntelligenceRunId", "matcherVersion", "ontologyVersion", "intelligenceSnapshotHash")
WHERE "status" = 'COMPLETED';

CREATE INDEX "RequirementAssessment_companyId_runId_idx" ON "RequirementAssessment"("companyId", "runId");
CREATE INDEX "RequirementAssessment_companyId_applicationId_idx" ON "RequirementAssessment"("companyId", "applicationId");
CREATE INDEX "RequirementAssessment_companyId_jobRequirementId_idx" ON "RequirementAssessment"("companyId", "jobRequirementId");
CREATE INDEX "RequirementAssessment_companyId_claimId_idx" ON "RequirementAssessment"("companyId", "claimId");
CREATE INDEX "RequirementAssessment_companyId_evidenceId_idx" ON "RequirementAssessment"("companyId", "evidenceId");

ALTER TABLE "SkillAlias" ADD CONSTRAINT "SkillAlias_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "SkillConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobIntelligenceRun" ADD CONSTRAINT "JobIntelligenceRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobIntelligenceRun" ADD CONSTRAINT "JobIntelligenceRun_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobIntelligenceRun" ADD CONSTRAINT "JobIntelligenceRun_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_runId_companyId_fkey" FOREIGN KEY ("runId", "companyId") REFERENCES "JobIntelligenceRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_skillConceptId_fkey" FOREIGN KEY ("skillConceptId") REFERENCES "SkillConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequirementAssessmentRun" ADD CONSTRAINT "RequirementAssessmentRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessmentRun" ADD CONSTRAINT "RequirementAssessmentRun_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessmentRun" ADD CONSTRAINT "RequirementAssessmentRun_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessmentRun" ADD CONSTRAINT "RequirementAssessmentRun_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "Job"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessmentRun" ADD CONSTRAINT "RequirementAssessmentRun_jobSpecificationVersionId_fkey" FOREIGN KEY ("jobSpecificationVersionId") REFERENCES "JobSpecificationVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessmentRun" ADD CONSTRAINT "RequirementAssessmentRun_jobIntelligenceRunId_companyId_fkey" FOREIGN KEY ("jobIntelligenceRunId", "companyId") REFERENCES "JobIntelligenceRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RequirementAssessment" ADD CONSTRAINT "RequirementAssessment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessment" ADD CONSTRAINT "RequirementAssessment_runId_companyId_fkey" FOREIGN KEY ("runId", "companyId") REFERENCES "RequirementAssessmentRun"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessment" ADD CONSTRAINT "RequirementAssessment_applicationId_companyId_fkey" FOREIGN KEY ("applicationId", "companyId") REFERENCES "Application"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessment" ADD CONSTRAINT "RequirementAssessment_candidateId_companyId_fkey" FOREIGN KEY ("candidateId", "companyId") REFERENCES "Candidate"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessment" ADD CONSTRAINT "RequirementAssessment_jobRequirementId_companyId_fkey" FOREIGN KEY ("jobRequirementId", "companyId") REFERENCES "JobRequirement"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessment" ADD CONSTRAINT "RequirementAssessment_claimId_companyId_fkey" FOREIGN KEY ("claimId", "companyId") REFERENCES "CandidateClaim"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequirementAssessment" ADD CONSTRAINT "RequirementAssessment_evidenceId_companyId_fkey" FOREIGN KEY ("evidenceId", "companyId") REFERENCES "CandidateEvidence"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "SkillConcept" ("canonicalKey", "displayName", "ontologyVersion", "provenance") VALUES
  ('javascript', 'JavaScript', 'v1', 'hireiq-curated-v1'),
  ('typescript', 'TypeScript', 'v1', 'hireiq-curated-v1'),
  ('python', 'Python', 'v1', 'hireiq-curated-v1'),
  ('django', 'Django', 'v1', 'hireiq-curated-v1'),
  ('flask', 'Flask', 'v1', 'hireiq-curated-v1'),
  ('fastapi', 'FastAPI', 'v1', 'hireiq-curated-v1'),
  ('react', 'React', 'v1', 'hireiq-curated-v1'),
  ('react_native', 'React Native', 'v1', 'hireiq-curated-v1'),
  ('postgresql', 'PostgreSQL', 'v1', 'hireiq-curated-v1'),
  ('mysql', 'MySQL', 'v1', 'hireiq-curated-v1'),
  ('golang', 'Go', 'v1', 'hireiq-curated-v1'),
  ('kubernetes', 'Kubernetes', 'v1', 'hireiq-curated-v1'),
  ('aws', 'AWS', 'v1', 'hireiq-curated-v1'),
  ('kafka', 'Kafka', 'v1', 'hireiq-curated-v1'),
  ('nodejs', 'Node.js', 'v1', 'hireiq-curated-v1'),
  ('java', 'Java', 'v1', 'hireiq-curated-v1');

INSERT INTO "SkillAlias" ("conceptId", "alias", "normalizedAlias", "relationshipType", "ontologyVersion", "provenance")
SELECT c.id, a.alias, a.normalized, 'ALIAS', 'v1', 'hireiq-curated-v1'
FROM "SkillConcept" c
JOIN (
  VALUES
    ('javascript', 'javascript', 'javascript'),
    ('javascript', 'js', 'js'),
    ('typescript', 'typescript', 'typescript'),
    ('typescript', 'ts', 'ts'),
    ('python', 'python', 'python'),
    ('python', 'python3', 'python3'),
    ('django', 'django', 'django'),
    ('flask', 'flask', 'flask'),
    ('fastapi', 'fastapi', 'fastapi'),
    ('react', 'react', 'react'),
    ('react', 'react.js', 'react.js'),
    ('react', 'reactjs', 'reactjs'),
    ('react_native', 'react native', 'react native'),
    ('react_native', 'react-native', 'react-native'),
    ('react_native', 'reactnative', 'reactnative'),
    ('postgresql', 'postgresql', 'postgresql'),
    ('postgresql', 'postgres', 'postgres'),
    ('postgresql', 'psql', 'psql'),
    ('mysql', 'mysql', 'mysql'),
    ('golang', 'go', 'go'),
    ('golang', 'golang', 'golang'),
    ('kubernetes', 'kubernetes', 'kubernetes'),
    ('kubernetes', 'k8s', 'k8s'),
    ('aws', 'aws', 'aws'),
    ('aws', 'amazon web services', 'amazon web services'),
    ('kafka', 'kafka', 'kafka'),
    ('nodejs', 'node.js', 'node.js'),
    ('nodejs', 'nodejs', 'nodejs'),
    ('nodejs', 'node', 'node'),
    ('java', 'java', 'java')
) AS a(canonical, alias, normalized) ON c."canonicalKey" = a.canonical AND c."ontologyVersion" = 'v1';
