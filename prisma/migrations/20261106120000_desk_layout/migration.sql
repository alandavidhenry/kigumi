-- Visual desk templates (ADR 0023): template home values, and the sheet's
-- snapshot of the channel defaults plus its master-area values.
ALTER TABLE "ConsoleTemplate" ADD COLUMN "defaultValues" JSONB;

ALTER TABLE "RecallSheet" ADD COLUMN "stripDefaults" JSONB,
ADD COLUMN "masterValues" JSONB;
