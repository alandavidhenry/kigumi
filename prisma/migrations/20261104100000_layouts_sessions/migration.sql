-- CreateTable
CREATE TABLE "RecordingSession" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "roomId" TEXT,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "channelsAvailable" INTEGER,
    "phantomMode" TEXT NOT NULL DEFAULT 'per_channel',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Layout" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "roomId" TEXT,
    "name" TEXT NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "lengthMm" INTEGER NOT NULL,
    "heightMm" INTEGER,
    "gridMm" INTEGER NOT NULL DEFAULT 500,
    "snapMm" INTEGER NOT NULL DEFAULT 50,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Layout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayoutItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "variant" TEXT,
    "label" TEXT,
    "xMm" INTEGER NOT NULL,
    "yMm" INTEGER NOT NULL,
    "zMm" INTEGER NOT NULL DEFAULT 0,
    "rotationDeg" INTEGER NOT NULL DEFAULT 0,
    "pitchDeg" INTEGER NOT NULL DEFAULT 0,
    "widthMm" INTEGER NOT NULL,
    "depthMm" INTEGER NOT NULL,
    "heightMm" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "groupId" TEXT,
    "micUnitId" TEXT,
    "equipmentItemId" TEXT,
    "patternSetting" TEXT,
    "showPattern" BOOLEAN NOT NULL DEFAULT false,
    "recommendationRef" TEXT,
    "notes" TEXT,

    CONSTRAINT "LayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputChannel" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "layoutItemId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'mic',
    "source" TEXT NOT NULL,
    "micUnitId" TEXT,
    "stand" TEXT,
    "preampInput" TEXT,
    "phantom" BOOLEAN NOT NULL DEFAULT false,
    "padDb" INTEGER,
    "dawName" TEXT,
    "notes" TEXT,

    CONSTRAINT "InputChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionShareLink" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordingSession_organisationId_startsAt_idx" ON "RecordingSession"("organisationId", "startsAt");

-- CreateIndex
CREATE INDEX "RecordingSession_roomId_idx" ON "RecordingSession"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Layout_sessionId_key" ON "Layout"("sessionId");

-- CreateIndex
CREATE INDEX "Layout_organisationId_isTemplate_idx" ON "Layout"("organisationId", "isTemplate");

-- CreateIndex
CREATE INDEX "LayoutItem_layoutId_idx" ON "LayoutItem"("layoutId");

-- CreateIndex
CREATE INDEX "LayoutItem_micUnitId_idx" ON "LayoutItem"("micUnitId");

-- CreateIndex
CREATE INDEX "LayoutItem_organisationId_idx" ON "LayoutItem"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "InputChannel_layoutItemId_key" ON "InputChannel"("layoutItemId");

-- CreateIndex
CREATE INDEX "InputChannel_organisationId_idx" ON "InputChannel"("organisationId");

-- CreateIndex
CREATE INDEX "InputChannel_micUnitId_idx" ON "InputChannel"("micUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "InputChannel_sessionId_number_key" ON "InputChannel"("sessionId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SessionShareLink_token_key" ON "SessionShareLink"("token");

-- CreateIndex
CREATE INDEX "SessionShareLink_sessionId_idx" ON "SessionShareLink"("sessionId");

-- CreateIndex
CREATE INDEX "SessionShareLink_organisationId_idx" ON "SessionShareLink"("organisationId");

-- AddForeignKey
ALTER TABLE "RecommendationRequest" ADD CONSTRAINT "RecommendationRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecordingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingSession" ADD CONSTRAINT "RecordingSession_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingSession" ADD CONSTRAINT "RecordingSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingSession" ADD CONSTRAINT "RecordingSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecordingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutItem" ADD CONSTRAINT "LayoutItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutItem" ADD CONSTRAINT "LayoutItem_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutItem" ADD CONSTRAINT "LayoutItem_micUnitId_fkey" FOREIGN KEY ("micUnitId") REFERENCES "MicrophoneUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutItem" ADD CONSTRAINT "LayoutItem_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputChannel" ADD CONSTRAINT "InputChannel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputChannel" ADD CONSTRAINT "InputChannel_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecordingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputChannel" ADD CONSTRAINT "InputChannel_layoutItemId_fkey" FOREIGN KEY ("layoutItemId") REFERENCES "LayoutItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputChannel" ADD CONSTRAINT "InputChannel_micUnitId_fkey" FOREIGN KEY ("micUnitId") REFERENCES "MicrophoneUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionShareLink" ADD CONSTRAINT "SessionShareLink_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionShareLink" ADD CONSTRAINT "SessionShareLink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecordingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A layout is either a session's own copy or a template, never both.
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_session_or_template_check" CHECK (("sessionId" IS NULL) = "isTemplate");
