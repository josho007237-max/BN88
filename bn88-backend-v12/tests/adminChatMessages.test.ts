import assert from "node:assert/strict";
import { fetchAdminChatMessages, HttpError } from "../src/routes/admin/chat";

function makeStubPrisma() {
  const conversations = [
    { id: "conv-1", botId: "bot-1", userId: "user-1", tenant: "t1" },
  ];
  const sessions = [
    {
      id: "sess-1",
      botId: "bot-1",
      userId: "user-1",
      platform: "line",
      tenant: "t1",
      conversationId: "conv-1",
    },
    {
      id: "sess-2",
      botId: "bot-2",
      userId: "user-2",
      platform: "telegram",
      tenant: "t1",
      conversationId: null,
    },
  ];
  const messages = [
    {
      id: "m-1",
      conversationId: "conv-1",
      sessionId: "sess-1",
      platform: "line",
      text: "hello",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      meta: null,
      attachmentUrl: null,
      attachmentMeta: null,
      type: "TEXT",
      session: { userId: "user-1", platform: "line" },
    },
    {
      id: "m-2",
      conversationId: "conv-1",
      sessionId: "sess-1",
      platform: "line",
      text: "hi",
      createdAt: new Date("2024-01-01T00:00:10Z"),
      meta: null,
      attachmentUrl: null,
      attachmentMeta: null,
      type: "TEXT",
      session: { userId: "user-1", platform: "line" },
    },
    {
      id: "m-3",
      conversationId: null,
      sessionId: "sess-2",
      platform: "telegram",
      text: "tg",
      createdAt: new Date("2024-01-02T00:00:00Z"),
      meta: null,
      attachmentUrl: null,
      attachmentMeta: null,
      type: "TEXT",
      session: { userId: "user-2", platform: "telegram" },
    },
  ];

  return {
    conversation: {
      findFirst: async ({ where }: any) =>
        conversations.find((c) => c.id === where.id && c.tenant === where.tenant) ?? null,
    },
    chatSession: {
      findFirst: async ({ where }: any) =>
        sessions.find((s) => s.id === where.id && s.tenant === where.tenant) ?? null,
    },
    chatMessage: {
      findMany: async ({ where, orderBy, skip = 0, take }: any) => {
        let list = messages.filter((m) => {
          if (where.conversationId) return m.conversationId === where.conversationId;
          if (where.sessionId) return m.sessionId === where.sessionId;
          return false;
        });
        if (orderBy?.createdAt === "asc") {
          list = list.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
          );
        }
        if (typeof take === "number") {
          list = list.slice(skip || 0, (skip || 0) + take);
        }
        return list.map((m) => ({
          ...m,
          conversation: conversations.find((c) => c.id === m.conversationId) || null,
        }));
      },
    },
  } as any;
}

async function testFetchByConversationId() {
  const prisma = makeStubPrisma();
  const res = await fetchAdminChatMessages({
    tenant: "t1",
    conversationId: "conv-1",
  }, prisma);

  assert.equal(res.conversationId, "conv-1");
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].conversationId, "conv-1");
}

async function testFetchBySessionId() {
  const prisma = makeStubPrisma();
  const res = await fetchAdminChatMessages({
    tenant: "t1",
    sessionId: "sess-2",
  }, prisma);

  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].sessionId, "sess-2");
  assert.equal(res.items[0].platform, "telegram");
}

async function testConversationNotFound() {
  const prisma = makeStubPrisma();
  let caught = false;
  try {
    await fetchAdminChatMessages({ tenant: "t1", conversationId: "missing" }, prisma);
  } catch (err: any) {
    caught = true;
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 404);
  }
  assert.ok(caught, "should throw 404 for missing conversation");
}

(async () => {
  await testFetchByConversationId();
  await testFetchBySessionId();
  await testConversationNotFound();
  console.log("adminChatMessages.test.ts passed");
})();
