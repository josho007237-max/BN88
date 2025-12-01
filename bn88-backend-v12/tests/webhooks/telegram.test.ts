import assert from "node:assert/strict";
import { MessageType } from "@prisma/client";

process.env.SECRET_ENC_KEY_BN9 ||= "12345678901234567890123456789012";
process.env.JWT_SECRET ||= "test-jwt";
process.env.ENABLE_ADMIN_API ||= "1";
process.env.DATABASE_URL ||= "file:./dev.db";
process.env.MESSAGE_RATE_LIMIT_PER_MIN ||= "1";
process.env.MESSAGE_RATE_LIMIT_WINDOW_SECONDS ||= "1";

type TgMsg = {
  message_id: number;
  date: number;
  chat: { id: number | string; type: string };
  text?: string;
  photo?: Array<{ file_id: string; width?: number; height?: number }>;
  document?: { file_id: string; file_name?: string };
  sticker?: { file_id: string; width?: number; height?: number };
  location?: { latitude: number; longitude: number };
};

async function run() {
  const { mapTelegramMessage } = await import("../../src/routes/webhooks/telegram");
  const {
    enqueueRateLimitedSend,
    enqueueFollowUpJob,
    flushFollowUps,
  } = await import("../../src/queues/message.queue");

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const baseMsg: TgMsg = {
    message_id: 1,
    date: Date.now(),
    chat: { id: 1, type: "private" },
    text: "hello",
  };

  const photoMsg: TgMsg = {
    ...baseMsg,
    message_id: 2,
    text: "photo",
    photo: [
      { file_id: "small", width: 10, height: 10 },
      { file_id: "big", width: 100, height: 100 },
    ],
  };

  const fileMsg: TgMsg = {
    ...baseMsg,
    message_id: 3,
    text: "doc",
    document: { file_id: "doc123", file_name: "doc.pdf" },
  };

  const stickerMsg: TgMsg = {
    ...baseMsg,
    message_id: 4,
    text: "sticker",
    sticker: { file_id: "stk123", width: 50, height: 50 },
  };

  const locationMsg: TgMsg = {
    ...baseMsg,
    message_id: 5,
    text: "loc",
    location: { latitude: 13.7, longitude: 100.5 },
  };

  const textMapped = mapTelegramMessage(baseMsg as any);
  assert.ok(textMapped, "text message should map");
  assert.equal(textMapped?.messageType, MessageType.TEXT);
  assert.equal(textMapped?.text, "hello");

  const photoMapped = mapTelegramMessage(photoMsg as any);
  assert.ok(photoMapped, "photo message should map");
  assert.equal(photoMapped?.messageType, MessageType.IMAGE);
  assert.equal(photoMapped?.attachmentMeta?.fileId, "big");

  const fileMapped = mapTelegramMessage(fileMsg as any);
  assert.ok(fileMapped, "file message should map");
  assert.equal(fileMapped?.messageType, MessageType.FILE);
  assert.ok(fileMapped?.attachmentUrl?.includes("doc123"));

  const stickerMapped = mapTelegramMessage(stickerMsg as any);
  assert.ok(stickerMapped, "sticker message should map");
  assert.equal(stickerMapped?.messageType, MessageType.STICKER);
  assert.ok(stickerMapped?.attachmentUrl?.includes("stk123"));

  const locationMapped = mapTelegramMessage(locationMsg as any);
  assert.ok(locationMapped, "location should map");
  assert.equal(locationMapped?.messageType, MessageType.SYSTEM);
  assert.ok(locationMapped?.attachmentUrl?.includes("google.com/maps"));

  // Rate limit behaviour: first send executes, second is deferred then runs
  let sent = 0;
  await enqueueRateLimitedSend({
    id: "tg-job-1",
    channelId: "telegram-channel-test",
    handler: async () => {
      sent += 1;
    },
    requestId: "tg-test",
  });

  await enqueueRateLimitedSend({
    id: "tg-job-2",
    channelId: "telegram-channel-test",
    handler: async () => {
      sent += 1;
    },
    requestId: "tg-test",
  });

  assert.equal(sent, 1, "first job should run immediately");
  await sleep(1200);
  assert.equal(sent, 2, "second job should run after delay when throttled");

  // Scheduled campaign/follow-up execution should run once even if scheduled twice
  let followUps = 0;
  await enqueueFollowUpJob({
    id: "tg-follow-1",
    delayMs: 30,
    payload: { msg: "hi" },
    handler: async () => {
      followUps += 1;
    },
    requestId: "tg-follow",
  });

  await enqueueFollowUpJob({
    id: "tg-follow-1",
    delayMs: 30,
    payload: { msg: "hi" },
    handler: async () => {
      followUps += 1;
    },
    requestId: "tg-follow",
  });

  await sleep(80);
  assert.equal(followUps, 1, "follow-up should be idempotent and execute once");
  await flushFollowUps();

  console.log("telegram webhook tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
