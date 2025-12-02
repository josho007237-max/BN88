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

type LineMsg = { id?: string; type: string; text?: string; fileName?: string };

type SimpleExpect = {
  toBe: (expected: any) => void;
  toContain: (item: any) => void;
};

const expect = (received: any): SimpleExpect => ({
  toBe: (expected: any) => assert.strictEqual(received, expected),
  toContain: (item: any) => assert.ok((received as any)?.includes?.(item)),
});

async function run() {
  const { mapLineMessage } = await import("../../src/routes/webhooks/line");
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
  expect(textMapped?.messageType).toBe(MessageType.TEXT);
  expect(textMapped?.text).toBe("hello");

  const imageMapped = mapLineMessage(imageMsg as any);
  expect(imageMapped?.messageType).toBe(MessageType.IMAGE);
  expect(imageMapped?.attachmentUrl?.includes("img123")).toBe(true);

  const fileMapped = mapLineMessage(fileMsg as any);
  expect(fileMapped?.messageType).toBe(MessageType.FILE);
  expect(fileMapped?.text).toBe("report");
  expect(fileMapped?.attachmentUrl?.includes("file123")).toBe(true);

  const stickerMapped = mapLineMessage(stickerMsg as any);
  expect(stickerMapped?.messageType).toBe(MessageType.STICKER);

  const locationMapped = mapLineMessage(locationMsg as any);
  expect(locationMapped?.messageType).toBe(MessageType.SYSTEM);
  expect(locationMapped?.attachmentUrl?.includes("google.com/maps")).toBe(true);

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
    campaignId: "cmp-1",
    cron: "* * * * *",
    timezone: "UTC",
    requestId: "line-cmp",
  });

  const scheduleHandler = workerHandlers.get("lep-campaign");
  await scheduleHandler?.({
    name: "campaign.schedule",
    data: { scheduleId: "sch-1", campaignId: "cmp-1", requestId: "line-cmp" },
    opts: {},
    updateData: async () => {},
    moveToDelayed: async () => {},
  } as StoredJob);

  expect(queuedCampaigns).toContain("cmp-1");

  // Scheduled follow-up idempotency
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
  expect(followUps).toBe(1);
  await flushFollowUps();

  console.log("line webhook tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
