-- CreateTable
CREATE TABLE "RecommendationRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdById" TEXT,
    "kind" TEXT NOT NULL,
    "roomId" TEXT,
    "sessionId" TEXT,
    "forDate" TEXT,
    "input" JSONB NOT NULL,
    "rules" JSONB NOT NULL,
    "locker" JSONB NOT NULL,
    "aliases" JSONB NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "profilesVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationResult" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "final" JSONB NOT NULL,
    "adjustments" JSONB,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationFeedback" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "userId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "swappedToUnitIds" TEXT[],
    "swappedToModelSlugs" TEXT[],
    "swappedToCandidate" BOOLEAN,
    "rating" INTEGER,
    "reasons" TEXT[],
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationRequest_organisationId_createdAt_idx" ON "RecommendationRequest"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationRequest_organisationId_inputHash_idx" ON "RecommendationRequest"("organisationId", "inputHash");

-- CreateIndex
CREATE INDEX "RecommendationResult_organisationId_createdAt_idx" ON "RecommendationResult"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationResult_requestId_idx" ON "RecommendationResult"("requestId");

-- CreateIndex
CREATE INDEX "RecommendationFeedback_organisationId_createdAt_idx" ON "RecommendationFeedback"("organisationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationFeedback_resultId_sourceKey_userId_key" ON "RecommendationFeedback"("resultId", "sourceKey", "userId");

-- AddForeignKey
ALTER TABLE "RecommendationRequest" ADD CONSTRAINT "RecommendationRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRequest" ADD CONSTRAINT "RecommendationRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRequest" ADD CONSTRAINT "RecommendationRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationResult" ADD CONSTRAINT "RecommendationResult_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationResult" ADD CONSTRAINT "RecommendationResult_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RecommendationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "RecommendationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
