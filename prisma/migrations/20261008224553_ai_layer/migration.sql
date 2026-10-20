-- CreateTable
CREATE TABLE "AiSummary" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSummary_kind_subjectKey_idx" ON "AiSummary"("kind", "subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "AiSummary_kind_inputHash_promptVersion_key" ON "AiSummary"("kind", "inputHash", "promptVersion");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_organisationId_month_key" ON "AiUsage"("organisationId", "month");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
