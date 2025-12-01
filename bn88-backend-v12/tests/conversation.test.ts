import assert from "node:assert/strict";
import { ensureConversation } from "../src/services/conversation";

function createStubPrisma() {
  const store: Record<string, any> = {};

  return {
    conversation: {
      async upsert({ where, create, update }: any) {
        const key = `${where.botId_userId.botId}:${where.botId_userId.userId}`;
        if (!store[key]) {
          const record = {
            id: `conv-${Object.keys(store).length + 1}`,
            botId: where.botId_userId.botId,
            userId: where.botId_userId.userId,
            tenant: create.tenant,
            platform: create.platform,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store[key] = record;
        } else {
          store[key] = { ...store[key], ...update, updatedAt: new Date() };
        }
        return store[key];
      },
    },
  } as any;
}

async function testCreateConversation() {
  const prisma = createStubPrisma();
  const convo = await ensureConversation(
    {
      botId: "bot-1",
      tenant: "t1",
      userId: "user-1",
      platform: "line",
      requestId: "req-1",
    },
    prisma,
  );

  assert.equal(convo.botId, "bot-1");
  assert.equal(convo.userId, "user-1");
  assert.equal(convo.platform, "line");
}

async function testReuseConversation() {
  const prisma = createStubPrisma();
  const first = await ensureConversation(
    {
      botId: "bot-1",
      tenant: "t1",
      userId: "user-1",
      platform: "line",
      requestId: "req-2",
    },
    prisma,
  );

  const second = await ensureConversation(
    {
      botId: "bot-1",
      tenant: "t1",
      userId: "user-1",
      platform: "line",
      requestId: "req-3",
    },
    prisma,
  );

  assert.equal(first.id, second.id);
  assert.equal(second.platform, "line");
}

async function main() {
  await testCreateConversation();
  await testReuseConversation();
  console.log("conversation tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
