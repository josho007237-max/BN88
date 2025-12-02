-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_botId_userId_unique" ON "Conversation"("botId", "userId");
CREATE INDEX "Conversation_bot_createdAt" ON "Conversation"("botId", "createdAt");

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "conversationId" TEXT;

-- CreateIndex
CREATE INDEX "ChatMessage_byConversation" ON "ChatMessage"("conversationId", "createdAt");

-- AddForeignKey
PRAGMA foreign_keys=OFF;
CREATE TABLE "_tmp_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "conversationId" TEXT,
    "senderType" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "attachmentUrl" TEXT,
    "attachmentMeta" TEXT,
    "platformMessageId" TEXT,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "_tmp_ChatMessage" ("id", "tenant", "botId", "platform", "sessionId", "senderType", "type", "text", "attachmentUrl", "attachmentMeta", "platformMessageId", "meta", "createdAt")
SELECT "id", "tenant", "botId", "platform", "sessionId", "senderType", "type", "text", "attachmentUrl", "attachmentMeta", "platformMessageId", "meta", "createdAt" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "_tmp_ChatMessage" RENAME TO "ChatMessage";
CREATE UNIQUE INDEX "ChatMessage_session_platformMsg_unique" ON "ChatMessage"("sessionId", "platformMessageId");
CREATE INDEX "ChatMessage_bySession" ON "ChatMessage"("sessionId", "createdAt");
CREATE INDEX "ChatMessage_byConversation" ON "ChatMessage"("conversationId", "createdAt");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
