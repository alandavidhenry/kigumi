-- Free organisations may use only part of the platform-wide daily AI cap
-- (Phase 8, M3), so paid tenants are never crowded out.
ALTER TABLE "AiPlatformUsage" ADD COLUMN "freeRequests" INTEGER NOT NULL DEFAULT 0;
