-- CreateTable
CREATE TABLE "MicrophoneModel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "transducerType" TEXT NOT NULL,
    "polarPatterns" TEXT[],
    "freqRangeMinHz" INTEGER,
    "freqRangeMaxHz" INTEGER,
    "sensitivityMvPa" DOUBLE PRECISION,
    "selfNoiseDbA" DOUBLE PRECISION,
    "maxSplDb" DOUBLE PRECISION,
    "impedanceOhm" DOUBLE PRECISION,
    "powering" TEXT NOT NULL,
    "phantomSafe" BOOLEAN,
    "pads" INTEGER[],
    "filters" TEXT[],
    "weightG" DOUBLE PRECISION,
    "dimensions" TEXT,
    "connector" TEXT,
    "discontinued" BOOLEAN NOT NULL DEFAULT false,
    "statedApplications" TEXT[],
    "specSheetUrl" TEXT,
    "wikidataId" TEXT,
    "specConditions" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrophoneModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provenance" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "documentTitle" TEXT,
    "documentPage" TEXT,
    "documentSha256" TEXT,
    "retrievedAt" TIMESTAMP(3),
    "licenceNotes" TEXT,
    "attribution" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "extraction" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicFieldProvenance" (
    "id" TEXT NOT NULL,
    "micModelId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "provenanceId" TEXT NOT NULL,

    CONSTRAINT "MicFieldProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicFrequencyResponse" (
    "id" TEXT NOT NULL,
    "micModelId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "filterSetting" TEXT,
    "points" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "provenanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicFrequencyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicPolarData" (
    "id" TEXT NOT NULL,
    "micModelId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "frequencyHz" INTEGER NOT NULL,
    "points" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "mirrored" BOOLEAN NOT NULL DEFAULT false,
    "provenanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicPolarData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicrophoneUnit" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "micModelId" TEXT NOT NULL,
    "equipmentItemId" TEXT NOT NULL,
    "serial" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'good',
    "matchedPairGroup" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrophoneUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MicrophoneModel_slug_key" ON "MicrophoneModel"("slug");

-- CreateIndex
CREATE INDEX "MicrophoneModel_status_idx" ON "MicrophoneModel"("status");

-- CreateIndex
CREATE INDEX "MicrophoneModel_manufacturer_idx" ON "MicrophoneModel"("manufacturer");

-- CreateIndex
CREATE INDEX "MicFieldProvenance_provenanceId_idx" ON "MicFieldProvenance"("provenanceId");

-- CreateIndex
CREATE UNIQUE INDEX "MicFieldProvenance_micModelId_field_key" ON "MicFieldProvenance"("micModelId", "field");

-- CreateIndex
CREATE INDEX "MicFrequencyResponse_micModelId_idx" ON "MicFrequencyResponse"("micModelId");

-- CreateIndex
CREATE INDEX "MicPolarData_micModelId_idx" ON "MicPolarData"("micModelId");

-- CreateIndex
CREATE UNIQUE INDEX "MicrophoneUnit_equipmentItemId_key" ON "MicrophoneUnit"("equipmentItemId");

-- CreateIndex
CREATE INDEX "MicrophoneUnit_organisationId_idx" ON "MicrophoneUnit"("organisationId");

-- CreateIndex
CREATE INDEX "MicrophoneUnit_organisationId_matchedPairGroup_idx" ON "MicrophoneUnit"("organisationId", "matchedPairGroup");

-- CreateIndex
CREATE INDEX "MicrophoneUnit_micModelId_idx" ON "MicrophoneUnit"("micModelId");

-- AddForeignKey
ALTER TABLE "MicFieldProvenance" ADD CONSTRAINT "MicFieldProvenance_micModelId_fkey" FOREIGN KEY ("micModelId") REFERENCES "MicrophoneModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicFieldProvenance" ADD CONSTRAINT "MicFieldProvenance_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicFrequencyResponse" ADD CONSTRAINT "MicFrequencyResponse_micModelId_fkey" FOREIGN KEY ("micModelId") REFERENCES "MicrophoneModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicFrequencyResponse" ADD CONSTRAINT "MicFrequencyResponse_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicPolarData" ADD CONSTRAINT "MicPolarData_micModelId_fkey" FOREIGN KEY ("micModelId") REFERENCES "MicrophoneModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicPolarData" ADD CONSTRAINT "MicPolarData_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicrophoneUnit" ADD CONSTRAINT "MicrophoneUnit_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicrophoneUnit" ADD CONSTRAINT "MicrophoneUnit_micModelId_fkey" FOREIGN KEY ("micModelId") REFERENCES "MicrophoneModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicrophoneUnit" ADD CONSTRAINT "MicrophoneUnit_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
