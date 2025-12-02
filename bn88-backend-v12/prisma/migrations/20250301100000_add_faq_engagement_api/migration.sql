PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "FaqEntry";
DROP TABLE IF EXISTS "EngagementMessage";

CREATE TABLE "FAQ" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FAQ_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FAQ_botId" ON "FAQ"("botId");

CREATE TABLE "EngagementMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'line',
    "channelId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "type" TEXT NOT NULL DEFAULT 'text',
    "meta" JSONB,
    "lastSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EngagementMessage_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EngagementMessage_channel" ON "EngagementMessage"("botId", "platform", "channelId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
