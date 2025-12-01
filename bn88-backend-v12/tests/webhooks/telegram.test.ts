import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { MessageType } from "@prisma/client";
import { handlers as workerHandlers, type StoredJob } from "../mocks/bullmq";

process.env.SECRET_ENC_KEY_BN9 ||= "12345678901234567890123456789012";
process.env.JWT_SECRET ||= "test-jwt";
process.env.ENABLE_ADMIN_API ||= "1";
process.env.DATABASE_URL ||= "file:./dev.db";
process.env.REDIS_RATE_LIMIT ||= "1";
process.env.MESSAGE_RATE_LIMIT_PER_MIN ||= "1";
process.env.MESSAGE_RATE_LIMIT_WINDOW_SECONDS ||= "1";

process.env.NODE_PATH = path.resolve(__dirname, "../mocks");
(Module as any)._initPaths();

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

type SimpleExpect = {
  toBe: (expected: any) => void;
  toContain: (item: any) => void;
};

const expect = (received: any): SimpleExpect => ({
  toBe: (expected: any) => assert.strictEqual(received, expected),
  toContain: (item: any) => assert.ok((received as any)?.includes?.(item)),
});

async function run() {
  const { mapTelegramMessage } = await import("../../src/routes/webhooks/telegram");
  const {
    enqueueRateLimitedSend,
    enqueueFollowUpJob,
    flushFollowUps,
  } = await import("../../src/queues/message.queue");
  const lepClient = await import("../../src/services/lepClient");
  let queuedCampaigns: string[] = [];
  lepClient.queueCampaign = async (id: string) => {
    queuedCampaigns.push(id);
    return { lepBaseUrl: "mock", status: 200, data: { ok: true } } as any;
  };

  const requireCjs = Module.createRequire(import.meta.url);
  const lepPath = requireCjs.resolve("../../src/services/lepClient");
  const lepModule = requireCjs(lepPath);
  lepModule.queueCampaign = async (id: string) => {
    queuedCampaigns.push(id);
    return { lepBaseUrl: "mock", status: 200, data: { ok: true } };
  };
  requireCjs.cache[lepPath] = { exports: lepModule } as any;
  const { upsertCampaignScheduleJob, startCampaignScheduleWorker } = await import(
    "../../src/queues/campaign.queue"
  );

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
  expect(textMapped?.messageType).toBe(MessageType.TEXT);
  expect(textMapped?.text).toBe("hello");

  const photoMapped = mapTelegramMessage(photoMsg as any);
  expect(photoMapped?.messageType).toBe(MessageType.IMAGE);
  expect(photoMapped?.attachmentMeta?.fileId).toBe("big");

  const fileMapped = mapTelegramMessage(fileMsg as any);
  expect(fileMapped?.messageType).toBe(MessageType.FILE);
  expect(fileMapped?.attachmentUrl?.includes("doc123")).toBe(true);

  const stickerMapped = mapTelegramMessage(stickerMsg as any);
  expect(stickerMapped?.messageType).toBe(MessageType.STICKER);
  expect(stickerMapped?.attachmentUrl?.includes("stk123")).toBe(true);

  const locationMapped = mapTelegramMessage(locationMsg as any);
  expect(locationMapped?.messageType).toBe(MessageType.SYSTEM);
  expect(locationMapped?.attachmentUrl?.includes("google.com/maps")).toBe(true);

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

  expect(sent).toBe(1);
  await sleep(1200);
  expect(sent).toBe(2);

  // Scheduled campaign execution via BullMQ stub
  startCampaignScheduleWorker();
  workerHandlers.set("lep-campaign", async (job) => {
    queuedCampaigns.push(job.data.campaignId);
  });
  await upsertCampaignScheduleJob({
    scheduleId: "sch-1",
    campaignId: "cmp-2",
    cron: "* * * * *",
    timezone: "UTC",
    requestId: "tg-cmp",
  });

  const scheduleHandler = workerHandlers.get("lep-campaign");
  await scheduleHandler?.({
    name: "campaign.schedule",
    data: { scheduleId: "sch-1", campaignId: "cmp-2", requestId: "tg-cmp" },
    opts: {},
    updateData: async () => {},
    moveToDelayed: async () => {},
  } as StoredJob);

  expect(queuedCampaigns).toContain("cmp-2");

  // Scheduled follow-up execution should run once even if scheduled twice
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
  expect(followUps).toBe(1);
  await flushFollowUps();

  console.log("telegram webhook tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
