-- CreateTable
CREATE TABLE "CampaignSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startAt" DATETIME,
    "endAt" DATETIME,
    "idempotencyKey" TEXT,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CampaignSchedule_campaignId" ON "CampaignSchedule"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSchedule_idempotencyKey_key" ON "CampaignSchedule"("idempotencyKey");
