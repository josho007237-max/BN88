-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "displayName" TEXT,
    "userAvatar" TEXT,
    "firstMessageAt" DATETIME,
    "lastMessageAt" DATETIME,
    "lastText" TEXT,
    "lastDirection" TEXT,
    "status" TEXT,
    "tags" JSONB,
    "adminNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatSession_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ChatSession" ("adminNote", "botId", "createdAt", "displayName", "firstMessageAt", "id", "lastDirection", "lastMessageAt", "lastText", "platform", "status", "tags", "tenant", "userAvatar", "userId", "userName") SELECT "adminNote", "botId", "createdAt", "displayName", "firstMessageAt", "id", "lastDirection", "lastMessageAt", "lastText", "platform", "status", "tags", "tenant", "userAvatar", "userId", "userName" FROM "ChatSession";
DROP TABLE "ChatSession";
ALTER TABLE "new_ChatSession" RENAME TO "ChatSession";
CREATE INDEX "ChatSession_list_index" ON "ChatSession"("botId", "platform", "lastMessageAt");
CREATE UNIQUE INDEX "ChatSession_botId_userId_unique" ON "ChatSession"("botId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
