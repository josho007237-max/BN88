import { strict as assert } from "node:assert";
import { MessageType } from "@prisma/client";
import { ensureConversation } from "../src/services/conversation";
import { executeSendAction } from "../src/services/actions";
import { createRequestLogger } from "../src/utils/logger";

function makeStubClient() {
  const conversations = new Map<string, any>();
  const messages: any[] = [];
  let convCounter = 0;

  const client = {
    conversation: {
      upsert: async ({ where, update, create }: any) => {
        const key = `${where.botId_userId.botId}:${where.botId_userId.userId}`;
        const existing = conversations.get(key);
        if (existing) {
          const next = { ...existing, ...update, updatedAt: new Date() };
          conversations.set(key, next);
          return next;
        }
        const created = {
          id: `conv-${++convCounter}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...create,
        };
        conversations.set(key, created);
        return created;
      },
    },
    chatMessage: {
      create: async ({ data, select }: any) => {
        const next = {
          ...data,
          id: `msg-${messages.length + 1}`,
          createdAt: new Date(),
        };
        messages.push(next);
        if (!select) return next;
        return Object.fromEntries(
          Object.keys(select).map((k) => [k, (next as any)[k]]),
        );
      },
    },
    chatSession: {
      update: async () => ({}),
    },
  } as any;

  return { client, conversations, messages };
}

async function testEnsureConversationReuse() {
  const { client } = makeStubClient();
  const first = await ensureConversation(
    { botId: "bot-1", tenant: "t1", userId: "u1" },
    client,
  );
  const second = await ensureConversation(
    { botId: "bot-1", tenant: "t1", userId: "u1" },
    client,
  );
  assert.equal(first.id, second.id, "should reuse conversation per bot+user");
}

async function testSendActionCarriesConversationId() {
  const { client, messages } = makeStubClient();
  const ctx = {
    bot: { id: "bot-1", tenant: "t1", secret: { channelAccessToken: "tok" } },
    session: { id: "sess-1" },
    conversation: { id: "conv-1" },
    platform: "line" as const,
    userId: "user-1",
    requestId: "req-conv",
    log: createRequestLogger("req-conv"),
  };

  const result = await executeSendAction(
    { type: "send_message", message: { type: MessageType.TEXT, text: "hi" } },
    ctx,
    {
      prisma: client,
      enqueueRateLimitedSend: async () => ({ scheduled: false, result: true }),
      recordDeliveryMetric: () => {},
      sendLinePushMessage: async () => true,
      sendTelegramPayload: async () => true,
      safeBroadcast: () => {},
    },
  );

  assert.equal(result.status, "handled");
  assert.equal(messages[0]?.conversationId, "conv-1");
}

(async () => {
  await testEnsureConversationReuse();
  await testSendActionCarriesConversationId();
  console.log("chatCenter.test.ts passed");
})();
