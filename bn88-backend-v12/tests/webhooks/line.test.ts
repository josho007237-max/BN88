import assert from "node:assert/strict";
import { MessageType } from "@prisma/client";

process.env.SECRET_ENC_KEY_BN9 ||= "12345678901234567890123456789012";
process.env.JWT_SECRET ||= "test-jwt";
process.env.ENABLE_ADMIN_API ||= "1";
process.env.DATABASE_URL ||= "file:./dev.db";
process.env.MESSAGE_RATE_LIMIT_PER_MIN ||= "1";
process.env.MESSAGE_RATE_LIMIT_WINDOW_SECONDS ||= "1";

type LineMsg = { id?: string; type: string; text?: string; fileName?: string };

async function run() {
  const { mapLineMessage } = await import("../../src/routes/webhooks/line");
  const {
    enqueueRateLimitedSend,
    enqueueFollowUpJob,
    flushFollowUps,
  } = await import("../../src/queues/message.queue");

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const textMsg: LineMsg = { id: "1", type: "text", text: "hello" };
  const imageMsg: LineMsg = { id: "img123", type: "image", text: "pic" };
  const fileMsg: LineMsg = {
    id: "file123",
    type: "file",
    text: "report",
    fileName: "report.pdf",
  };
  const stickerMsg: LineMsg = { id: "st123", type: "sticker" };
  const locationMsg: LineMsg = {
    id: "loc1",
    type: "location",
    title: "HQ",
    address: "Bangkok",
    latitude: 13.7563,
    longitude: 100.5018,
  };

  const textMapped = mapLineMessage(textMsg as any);
  assert.ok(textMapped, "text message should map");
  assert.equal(textMapped?.messageType, MessageType.TEXT);
  assert.equal(textMapped?.text, "hello");

  const imageMapped = mapLineMessage(imageMsg as any);
  assert.ok(imageMapped, "image message should map");
  assert.equal(imageMapped?.messageType, MessageType.IMAGE);
  assert.ok(
    imageMapped?.attachmentUrl?.includes("img123"),
    "image should expose content url",
  );

  const fileMapped = mapLineMessage(fileMsg as any);
  assert.ok(fileMapped, "file message should map");
  assert.equal(fileMapped?.messageType, MessageType.FILE);
  assert.equal(fileMapped?.text, "report");
  assert.ok(
    fileMapped?.attachmentUrl?.includes("file123"),
    "file should expose content url",
  );

  const stickerMapped = mapLineMessage(stickerMsg as any);
  assert.ok(stickerMapped, "sticker should map");
  assert.equal(stickerMapped?.messageType, MessageType.STICKER);

  const locationMapped = mapLineMessage(locationMsg as any);
  assert.ok(locationMapped, "location should map");
  assert.equal(locationMapped?.messageType, MessageType.SYSTEM);
  assert.ok(
    locationMapped?.attachmentUrl?.includes("google.com/maps"),
    "location should include map url",
  );

  // Rate limit behaviour: first send executes, second is deferred then runs
  let sent = 0;
  await enqueueRateLimitedSend({
    id: "line-job-1",
    channelId: "line-channel-test",
    handler: async () => {
      sent += 1;
    },
    requestId: "line-test",
  });

  await enqueueRateLimitedSend({
    id: "line-job-2",
    channelId: "line-channel-test",
    handler: async () => {
      sent += 1;
    },
    requestId: "line-test",
  });

  assert.equal(sent, 1, "first job should run immediately");
  await sleep(1200);
  assert.equal(sent, 2, "second job should run after delay when throttled");

  // Scheduled campaign/follow-up execution should run once even if scheduled twice
  let followUps = 0;
  await enqueueFollowUpJob({
    id: "line-follow-1",
    delayMs: 30,
    payload: { msg: "hi" },
    handler: async () => {
      followUps += 1;
    },
    requestId: "line-follow",
  });

  await enqueueFollowUpJob({
    id: "line-follow-1",
    delayMs: 30,
    payload: { msg: "hi" },
    handler: async () => {
      followUps += 1;
    },
    requestId: "line-follow",
  });

  await sleep(80);
  assert.equal(followUps, 1, "follow-up should be idempotent and execute once");
  await flushFollowUps();

  console.log("line webhook tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
