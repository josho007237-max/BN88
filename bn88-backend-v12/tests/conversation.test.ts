import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const testDbPath = path.join(__dirname, "tmp", "conversation.test.db");
const testDbUrl = `file:${testDbPath}`;
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = "test";
process.env.SECRET_ENC_KEY_BN9 = process.env.SECRET_ENC_KEY_BN9 || "12345678901234567890123456789012";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.TENANT_DEFAULT = "tenant-1";

const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

async function resetSchema() {
  fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
  execSync("npx prisma db push --force-reset --skip-generate --schema prisma/schema.prisma", {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: "inherit",
  });
}

async function clearData() {
  console.log("[Test] clearData prisma defined", prisma !== undefined);
  if (!(prisma as any).chatMessage) {
    console.log("[Test] prisma keys", Object.keys(prisma));
  }
  await prisma.chatMessage?.deleteMany({});
  await prisma.chatSession.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.botConfig.deleteMany({});
  await prisma.bot.deleteMany({});
}

async function seedBot(botId = "bot-test", platform = "line") {
  const bot = await prisma.bot.create({
    data: { id: botId, tenant: "tenant-1", name: "Test Bot", platform, active: true },
  });
  await prisma.botConfig.create({ data: { botId: bot.id, tenant: bot.tenant, systemPrompt: "" } });
  return bot;
}

async function sendInbound(
  processIncomingMessage: typeof import("../src/services/inbound/processIncomingMessage")
    .processIncomingMessage,
  userId: string,
  botId = "bot-test",
  requestId = "req"
) {
  return processIncomingMessage({
    botId,
    platform: "line",
    userId,
    text: "hello", // use non-TEXT message type to skip AI
    messageType: "IMAGE",
    platformMessageId: undefined,
    rawPayload: { kind: "image" },
    requestId,
  });
}

async function run() {
  const failures: string[] = [];
  await resetSchema();
  await clearData();
  await seedBot();
  const { fetchAdminChatMessages, HttpError } = await import("../src/routes/admin/chat");
  const { processIncomingMessage } = await import(
    "../src/services/inbound/processIncomingMessage"
  );

  // 1) New message creates conversation
  await clearData();
  await seedBot();
  await sendInbound(processIncomingMessage, "user-1", "bot-test", "req-1");
  const conversations1 = await prisma.conversation.findMany();
  const messages1 = await prisma.chatMessage.findMany();
  try {
    assert.equal(conversations1.length, 1);
    assert.equal(messages1[0]?.conversationId, conversations1[0]?.id);
    console.log(`[Test] conversationId=${conversations1[0]?.id} messages=${messages1.length}`);
  } catch (err: any) {
    failures.push(`case1: ${err.message}`);
  }

  // 2) Subsequent messages reuse conversation
  await clearData();
  await seedBot();
  await sendInbound(processIncomingMessage, "user-1", "bot-test", "req-2");
  await sendInbound(processIncomingMessage, "user-1", "bot-test", "req-3");
  const conversations2 = await prisma.conversation.findMany();
  const messages2 = await prisma.chatMessage.findMany({ orderBy: { createdAt: "asc" } });
  try {
    assert.equal(conversations2.length, 1);
    assert.equal(messages2[0]?.conversationId, messages2[1]?.conversationId);
    console.log(`[Test] conversationId=${conversations2[0]?.id} messages=${messages2.length}`);
  } catch (err: any) {
    failures.push(`case2: ${err.message}`);
  }

  // 3) Different user creates new conversation
  await clearData();
  await seedBot();
  await sendInbound(processIncomingMessage, "user-1", "bot-test", "req-4");
  await sendInbound(processIncomingMessage, "user-2", "bot-test", "req-5");
  const conversations3 = await prisma.conversation.findMany({ orderBy: { createdAt: "asc" } });
  try {
    assert.equal(conversations3.length, 2);
    assert.notEqual(conversations3[0]?.id, conversations3[1]?.id);
  } catch (err: any) {
    failures.push(`case3: ${err.message}`);
  }

  // Prepare data for API tests
  await clearData();
  await seedBot();
  await sendInbound(processIncomingMessage, "user-api", "bot-test", "req-6");
  await sendInbound(processIncomingMessage, "user-api", "bot-test", "req-7");
  const convoApi = await prisma.conversation.findFirst({ where: { userId: "user-api" } });
  const sessionApi = await prisma.chatSession.findFirst({ where: { userId: "user-api" } });

  // 4) API by conversationId
  try {
    const res = await fetchAdminChatMessages(
      { tenant: "tenant-1", conversationId: convoApi!.id, limit: 50 },
      prisma as any,
    );
    console.log(`[Test] conversationId=${convoApi!.id} messages=${res.items.length}`);
    assert.equal(res.conversationId, convoApi!.id);
    assert.ok(res.items.every((m: any) => m.conversationId === convoApi!.id));
  } catch (err: any) {
    failures.push(`case4: ${err.message}`);
  }

  // 5) Legacy sessionId still works
  try {
    const res = await fetchAdminChatMessages(
      { tenant: "tenant-1", sessionId: sessionApi!.id, limit: 50 },
      prisma as any,
    );
    assert.equal(res.items.length, 2);
    assert.equal(res.items[0]?.sessionId, sessionApi!.id);
  } catch (err: any) {
    failures.push(`case5: ${err.message}`);
  }

  // 6) Invalid conversationId returns 404
  try {
    await fetchAdminChatMessages({ tenant: "tenant-1", conversationId: "missing" }, prisma as any);
    failures.push("case6: expected 404");
  } catch (err: any) {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 404);
  }

  await prisma.$disconnect();

  if (failures.length > 0) {
    console.error("conversation.test.ts failures:\n" + failures.join("\n"));
    process.exit(1);
  }

  console.log("conversation.test.ts passed");
}

run().catch((err) => {
  console.error(err);
  prisma
    .$disconnect()
    .catch(() => undefined)
    .finally(() => process.exit(1));
});
