-- Share link tokens are no longer stored in plain text (Phase 8, L5).
-- Existing links keep working: their hash is computed here. Their display copy
-- can't be sealed in SQL (the key lives outside the database), so members are
-- offered a new link for those instead of seeing the old one.
ALTER TABLE "SessionShareLink" ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "SessionShareLink" ADD COLUMN "tokenSealed" TEXT;

UPDATE "SessionShareLink"
SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');

ALTER TABLE "SessionShareLink" ALTER COLUMN "tokenHash" SET NOT NULL;

DROP INDEX "SessionShareLink_token_key";
ALTER TABLE "SessionShareLink" DROP COLUMN "token";

CREATE UNIQUE INDEX "SessionShareLink_tokenHash_key" ON "SessionShareLink"("tokenHash");
