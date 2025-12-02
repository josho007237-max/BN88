-- CreateTable
CREATE TABLE "FaqEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FaqEntry_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngagementMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" DATETIME,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngagementMessage_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "FaqEntry_bot_enabled" ON "FaqEntry"("botId", "enabled");
CREATE INDEX "EngagementMessage_channel" ON "EngagementMessage"("botId", "platform", "channelId");
