import assert from "node:assert/strict";
import { test } from "node:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import * as lineSvc from "../src/services/line";

const testDbPath = path.join(__dirname, "tmp", "faqAutoReply.db");
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
    data: { id: "bot-faq", tenant: "tenant-1", name: "FAQ Bot", platform: "line", active: true },
  });
  await prisma.botConfig.create({ data: { botId: bot.id, tenant: bot.tenant, systemPrompt: "" } });
  await prisma.botSecret.create({ data: { botId: bot.id, channelAccessToken: "dummy", channelSecret: "secret" } });
  await prisma.fAQ.create({
    data: {
      botId: bot.id,
      question: "ค่าธรรมเนียม",
      answer: "ไม่มีค่าธรรมเนียม",
    },
  });
  await prisma.engagementMessage.create({
    data: {
      botId: bot.id,
      platform: "line",
      channelId: "U123",
      text: "โหวตความเห็นของคุณ",
      interval: 1,
      meta: { pollOptions: ["A", "B"] },
    },
  });
  return bot;
}

test("FAQ auto reply is used when question matches", async () => {
  await resetDb();
  const bot = await seedBot();

  const { processIncomingMessage } = await import(
    "../src/services/inbound/processIncomingMessage"
  );

  const result = await processIncomingMessage({
    botId: bot.id,
    platform: "line",
    userId: "user-1",
    text: "มีค่าธรรมเนียมหรือไม่?",
    messageType: "TEXT",
    platformMessageId: "m1",
    requestId: "req-faq",
  });

  assert.equal(result.reply, "ไม่มีค่าธรรมเนียม");
  const botMessages = await prisma.chatMessage.findMany({ where: { senderType: "bot" } });
  assert.equal(botMessages.length, 1);
  const meta = botMessages[0].meta as any;
  assert.ok(meta?.faqId);
});

test("Engagement message dispatches and logs as bot", async () => {
  await resetDb();
  const bot = await seedBot();

  (lineSvc as any).sendLinePushMessage = async () => true;

  const { triggerEngagementOnce } = await import(
    "../src/services/engagementScheduler"
  );

  await triggerEngagementOnce((await prisma.engagementMessage.findFirstOrThrow()).id, "req-engage");

  const logs = await prisma.chatMessage.findMany({ where: { senderType: "bot" } });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].text, "โหวตความเห็นของคุณ");
});
