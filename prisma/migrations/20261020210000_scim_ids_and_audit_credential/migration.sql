-- 1. SCIM directory ids are PostgreSQL-assigned. Older code inserted explicit, per-company numbers into a global
--    primary key without advancing the sequence, so the sequence can sit behind existing rows. Move each sequence to
--    at least the largest existing id. It never moves backwards, and no row is changed.
SELECT setval(
  pg_get_serial_sequence('"ScimDirectoryUser"', 'id'),
  GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "ScimDirectoryUser"), (SELECT last_value FROM "ScimDirectoryUser_id_seq"), 1)
);
SELECT setval(
  pg_get_serial_sequence('"ScimDirectoryGroup"', 'id'),
  GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "ScimDirectoryGroup"), (SELECT last_value FROM "ScimDirectoryGroup_id_seq"), 1)
);

-- 2. Which SCIM credential acted. Only the credential's row id, never the token or its hash. Existing rows keep NULL
--    and are not rewritten (DDL does not fire the append-only row trigger).
ALTER TABLE "AuditLog" ADD COLUMN "scimTokenId" INTEGER;
CREATE INDEX "AuditLog_scimTokenId_idx" ON "AuditLog"("scimTokenId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_scimTokenId_fkey" FOREIGN KEY ("scimTokenId") REFERENCES "ScimToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only SCIM rows carry a credential id, and new SCIM rows must carry one. NOT VALID: new writes only.
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_scim_token_only_for_scim" CHECK ("scimTokenId" IS NULL OR "actorRole" = 'SCIM') NOT VALID;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_scim_requires_token" CHECK ("actorRole" <> 'SCIM' OR "scimTokenId" IS NOT NULL) NOT VALID;

-- Rollback (manual): DROP both CHECK constraints, the FK and index, then DROP COLUMN "scimTokenId". The sequence change needs none.
-- Note: a ScimToken row that has audit history cannot be deleted (RESTRICT). Revoke it with revokedAt instead.
