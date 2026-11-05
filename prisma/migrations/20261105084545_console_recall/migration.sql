-- CreateTable
CREATE TABLE "ConsoleTemplate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "strip" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsoleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Console" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "channelCount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Console_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecallSheet" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "consoleId" TEXT,
    "consoleName" TEXT NOT NULL,
    "channelCount" INTEGER NOT NULL,
    "strip" JSONB NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecallSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecallChannel" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "recallSheetId" TEXT NOT NULL,
    "stripNumber" INTEGER NOT NULL,
    "inputChannelId" TEXT,
    "label" TEXT NOT NULL,
    "micName" TEXT,
    "values" JSONB,
    "notes" TEXT,

    CONSTRAINT "RecallChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboardRecall" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "recallSheetId" TEXT NOT NULL,
    "equipmentItemId" TEXT,
    "name" TEXT NOT NULL,
    "insertOn" TEXT,
    "settings" JSONB,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OutboardRecall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsoleTemplate_organisationId_idx" ON "ConsoleTemplate"("organisationId");

-- CreateIndex
CREATE INDEX "Console_organisationId_idx" ON "Console"("organisationId");

-- CreateIndex
CREATE INDEX "Console_templateId_idx" ON "Console"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "RecallSheet_sessionId_key" ON "RecallSheet"("sessionId");

-- CreateIndex
CREATE INDEX "RecallSheet_organisationId_idx" ON "RecallSheet"("organisationId");

-- CreateIndex
CREATE INDEX "RecallSheet_consoleId_idx" ON "RecallSheet"("consoleId");

-- CreateIndex
CREATE INDEX "RecallChannel_organisationId_idx" ON "RecallChannel"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "RecallChannel_recallSheetId_stripNumber_key" ON "RecallChannel"("recallSheetId", "stripNumber");

-- CreateIndex
CREATE INDEX "OutboardRecall_organisationId_idx" ON "OutboardRecall"("organisationId");

-- CreateIndex
CREATE INDEX "OutboardRecall_recallSheetId_idx" ON "OutboardRecall"("recallSheetId");

-- AddForeignKey
ALTER TABLE "ConsoleTemplate" ADD CONSTRAINT "ConsoleTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Console" ADD CONSTRAINT "Console_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Console" ADD CONSTRAINT "Console_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ConsoleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallSheet" ADD CONSTRAINT "RecallSheet_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallSheet" ADD CONSTRAINT "RecallSheet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RecordingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallSheet" ADD CONSTRAINT "RecallSheet_consoleId_fkey" FOREIGN KEY ("consoleId") REFERENCES "Console"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallChannel" ADD CONSTRAINT "RecallChannel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallChannel" ADD CONSTRAINT "RecallChannel_recallSheetId_fkey" FOREIGN KEY ("recallSheetId") REFERENCES "RecallSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallChannel" ADD CONSTRAINT "RecallChannel_inputChannelId_fkey" FOREIGN KEY ("inputChannelId") REFERENCES "InputChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboardRecall" ADD CONSTRAINT "OutboardRecall_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboardRecall" ADD CONSTRAINT "OutboardRecall_recallSheetId_fkey" FOREIGN KEY ("recallSheetId") REFERENCES "RecallSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboardRecall" ADD CONSTRAINT "OutboardRecall_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
