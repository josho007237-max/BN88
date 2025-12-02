/*
  Warnings:

  - You are about to alter the column `meta` on the `CampaignSchedule` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `attachmentMeta` on the `ChatMessage` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `meta` on the `ChatMessage` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - Added the required column `platform` to the `Conversation` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CampaignSchedule" (
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
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CampaignSchedule" ("campaignId", "createdAt", "cronExpr", "endAt", "id", "idempotencyKey", "lastRunAt", "meta", "nextRunAt", "startAt", "status", "timezone", "updatedAt") SELECT "campaignId", "createdAt", "cronExpr", "endAt", "id", "idempotencyKey", "lastRunAt", "meta", "nextRunAt", "startAt", "status", "timezone", "updatedAt" FROM "CampaignSchedule";
DROP TABLE "CampaignSchedule";
ALTER TABLE "new_CampaignSchedule" RENAME TO "CampaignSchedule";
CREATE UNIQUE INDEX "CampaignSchedule_idempotencyKey_key" ON "CampaignSchedule"("idempotencyKey");
CREATE INDEX "CampaignSchedule_campaignId" ON "CampaignSchedule"("campaignId");
CREATE TABLE "new_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sessionId" TEXT,
    "conversationId" TEXT,
    "senderType" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "text" TEXT NOT NULL DEFAULT '',
    "attachmentUrl" TEXT,
    "attachmentMeta" JSONB,
    "platformMessageId" TEXT,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChatMessage" ("attachmentMeta", "attachmentUrl", "botId", "conversationId", "createdAt", "id", "meta", "platform", "platformMessageId", "senderType", "sessionId", "tenant", "text", "type") SELECT "attachmentMeta", "attachmentUrl", "botId", "conversationId", "createdAt", "id", "meta", "platform", "platformMessageId", "senderType", "sessionId", "tenant", coalesce("text", '') AS "text", "type" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
CREATE INDEX "ChatMessage_bySession" ON "ChatMessage"("sessionId", "createdAt");
CREATE INDEX "ChatMessage_byConversation" ON "ChatMessage"("conversationId", "createdAt");
CREATE UNIQUE INDEX "ChatMessage_session_platformMsg_unique" ON "ChatMessage"("sessionId", "platformMessageId");
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("botId", "createdAt", "id", "tenant", "updatedAt", "userId", "platform")
SELECT "botId", "createdAt", "id", "tenant", "updatedAt", "userId", 'unknown'
FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_bot_createdAt" ON "Conversation"("botId", "createdAt");
CREATE UNIQUE INDEX "Conversation_botId_userId_unique" ON "Conversation"("botId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
