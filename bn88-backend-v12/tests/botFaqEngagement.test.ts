import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import * as lineSvc from "../src/services/line";

const testDbPath = path.join(__dirname, "tmp", "botFaqEngagement.db");
const testDbUrl = `file:${testDbPath}`;
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = "test";
process.env.SECRET_ENC_KEY_BN9 = process.env.SECRET_ENC_KEY_BN9 || "12345678901234567890123456789012";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt";
process.env.TENANT_DEFAULT = "tenant-1";

const prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } });

async function resetDb() {
  fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
  execSync("npx prisma db push --force-reset --skip-generate --schema prisma/schema.prisma", {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: "inherit",
  });
}

async function seedBot() {
  const bot = await prisma.bot.create({
    data: { id: "bot-auto", tenant: "tenant-1", name: "Auto Bot", platform: "line", active: true },
  });
  await prisma.botConfig.create({ data: { botId: bot.id, tenant: bot.tenant, systemPrompt: "" } });
  await prisma.botSecret.create({
    data: {
      botId: bot.id,
      channelAccessToken: "dummy",
      channelSecret: "secret",
      telegramBotToken: "dummy-telegram",
    },
  });
  return bot;
}

function stubLineSend() {
  (lineSvc as any).sendLinePushMessage = async () => true;
}

test("FAQ CRUD and auto-reply", async () => {
  await resetDb();
  const bot = await seedBot();

  const { createFaq, updateFaq, listFaq, deleteFaq } = await import(
    "../src/routes/admin/botAutomation"
  );

  const created = await createFaq({ botId: bot.id, question: "เปิดบัญชี", answer: "ทำผ่านแอป" });
  assert.ok(created.id);

  const listed = await listFaq(bot.id);
  assert.equal(listed.length, 1);

  const updated = await updateFaq(created.id, { answer: "สมัครใน 1 นาที" });
  assert.equal(updated.answer, "สมัครใน 1 นาที");

  const { processIncomingMessage } = await import("../src/services/inbound/processIncomingMessage");
  const resp = await processIncomingMessage({
    botId: bot.id,
    platform: "line",
    userId: "user-123",
    text: "เปิดบัญชีอย่างไร?",
    messageType: "TEXT",
    platformMessageId: "msg-1",
    requestId: "req-faq",
  });

  assert.equal(resp.reply, "สมัครใน 1 นาที");
  const botMsg = await prisma.chatMessage.findFirstOrThrow({ where: { senderType: "bot" } });
  const meta = botMsg.meta as any;
  assert.equal(meta?.faqId, created.id);

  await deleteFaq(created.id);
  const afterDelete = await listFaq(bot.id);
  assert.equal(afterDelete.length, 0);
});

test("Engagement CRUD and scheduler dispatch", async () => {
  await resetDb();
  const bot = await seedBot();
  stubLineSend();

  const { createEngagement, updateEngagement, listEngagement } = await import(
    "../src/routes/admin/botAutomation"
  );
  const { triggerEngagementOnce } = await import(
    "../src/services/engagementScheduler"
  );

  const engagement = await createEngagement({
    botId: bot.id,
    platform: "line",
    channelId: "U123",
    text: "โหวตความเห็น",
    interval: 5,
    enabled: true,
    type: "text",
  });

  const listed = await listEngagement(bot.id);
  assert.equal(listed.length, 1);

  const updated = await updateEngagement(engagement.id, { interval: 10 });
  assert.equal(updated.interval, 10);

  await triggerEngagementOnce(updated.id, "req-engagement");
  const logMsg = await prisma.chatMessage.findFirst({
    where: { senderType: "bot" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(logMsg);
  assert.equal(logMsg?.text, "โหวตความเห็น");
  const meta = (logMsg?.meta ?? {}) as any;
  assert.equal(meta.engagementId, updated.id);
});
