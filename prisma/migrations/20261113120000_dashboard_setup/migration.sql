-- AlterTable: existing organisations are treated as already set up.
ALTER TABLE "organization" ADD COLUMN "setupResolvedAt" TIMESTAMP(3);
UPDATE "organization" SET "setupResolvedAt" = CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "DashboardPreference" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardPreference_organisationId_userId_key" ON "DashboardPreference"("organisationId", "userId");

-- AddForeignKey
ALTER TABLE "DashboardPreference" ADD CONSTRAINT "DashboardPreference_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
