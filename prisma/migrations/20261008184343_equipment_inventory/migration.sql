-- CreateTable
CREATE TABLE "EquipmentItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "roomId" TEXT,
    "category" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serial" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'in_service',
    "purchaseDate" TIMESTAMP(3),
    "purchasePriceMinor" INTEGER,
    "supplier" TEXT,
    "tags" TEXT[],
    "customFields" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'photo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentItem_organisationId_idx" ON "EquipmentItem"("organisationId");

-- CreateIndex
CREATE INDEX "EquipmentItem_organisationId_category_idx" ON "EquipmentItem"("organisationId", "category");

-- CreateIndex
CREATE INDEX "EquipmentItem_roomId_idx" ON "EquipmentItem"("roomId");

-- CreateIndex
CREATE INDEX "Attachment_organisationId_entityType_entityId_idx" ON "Attachment"("organisationId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
