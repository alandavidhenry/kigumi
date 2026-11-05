-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "equipmentItemId" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "equipmentItemId" TEXT,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "intervalDays" INTEGER,
    "intervalHours" INTEGER,
    "leadDays" INTEGER NOT NULL DEFAULT 14,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTask" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "equipmentItemId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "dueHours" DOUBLE PRECISION,
    "lastDoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "equipmentItemId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "performedById" TEXT,
    "notes" TEXT,
    "costMinor" INTEGER,
    "hoursAtService" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatTest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "equipmentItemId" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL,
    "testType" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "testerName" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "intervalMonths" INTEGER NOT NULL,
    "nextDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warranty" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "equipmentItemId" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3) NOT NULL,
    "provider" TEXT,
    "reference" TEXT,
    "terms" TEXT,
    "leadDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_equipmentItemId_key" ON "UsageCounter"("equipmentItemId");

-- CreateIndex
CREATE INDEX "UsageCounter_organisationId_idx" ON "UsageCounter"("organisationId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_organisationId_idx" ON "MaintenancePlan"("organisationId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_equipmentItemId_idx" ON "MaintenancePlan"("equipmentItemId");

-- CreateIndex
CREATE INDEX "MaintenanceTask_organisationId_dueAt_idx" ON "MaintenanceTask"("organisationId", "dueAt");

-- CreateIndex
CREATE INDEX "MaintenanceTask_equipmentItemId_idx" ON "MaintenanceTask"("equipmentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceTask_planId_equipmentItemId_key" ON "MaintenanceTask"("planId", "equipmentItemId");

-- CreateIndex
CREATE INDEX "MaintenanceLog_organisationId_performedAt_idx" ON "MaintenanceLog"("organisationId", "performedAt");

-- CreateIndex
CREATE INDEX "MaintenanceLog_equipmentItemId_idx" ON "MaintenanceLog"("equipmentItemId");

-- CreateIndex
CREATE INDEX "PatTest_organisationId_nextDueAt_idx" ON "PatTest"("organisationId", "nextDueAt");

-- CreateIndex
CREATE INDEX "PatTest_equipmentItemId_testedAt_idx" ON "PatTest"("equipmentItemId", "testedAt");

-- CreateIndex
CREATE INDEX "Warranty_organisationId_endsOn_idx" ON "Warranty"("organisationId", "endsOn");

-- CreateIndex
CREATE INDEX "Warranty_equipmentItemId_idx" ON "Warranty"("equipmentItemId");

-- CreateIndex
CREATE INDEX "Notification_organisationId_userId_readAt_idx" ON "Notification"("organisationId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTask" ADD CONSTRAINT "MaintenanceTask_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTask" ADD CONSTRAINT "MaintenanceTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTask" ADD CONSTRAINT "MaintenanceTask_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatTest" ADD CONSTRAINT "PatTest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatTest" ADD CONSTRAINT "PatTest_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
