-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN "adminNote" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "status" TEXT DEFAULT 'open';
ALTER TABLE "ChatSession" ADD COLUMN "tags" JSONB;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CaseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "text" TEXT NOT NULL,
    "meta" JSONB,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseItem_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CaseItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CaseItem" ("botId", "createdAt", "id", "kind", "meta", "platform", "sessionId", "tenant", "text", "userId") SELECT "botId", "createdAt", "id", "kind", "meta", "platform", "sessionId", "tenant", "text", "userId" FROM "CaseItem";
DROP TABLE "CaseItem";
ALTER TABLE "new_CaseItem" RENAME TO "CaseItem";
CREATE INDEX "CaseItem_byBotDate" ON "CaseItem"("botId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
