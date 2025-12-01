import { strict as assert } from "node:assert";
import { MessageType } from "@prisma/client";
import {
  ActionContext,
  executeFollowUpAction,
  executeSegmentAction,
  executeSendAction,
  executeTagAction,
} from "../src/services/actions";
import { createRequestLogger } from "../src/utils/logger";

type PrismaStub = {
  chatMessage: { create: (args: any) => Promise<any> };
  chatSession: { update: (args: any) => Promise<any> };
  memoryItem: {
    findUnique: (args: any) => Promise<any>;
    upsert: (args: any) => Promise<any>;
  };
};

function makePrismaStub() {
  const messages: any[] = [];
  const sessions: any[] = [];
  const memory: Record<string, any> = {};

  const keyFrom = (where: any) => {
    const { tenant, userRef, key } = where.tenant_userRef_key;
    return `${tenant}:${userRef}:${key}`;
  };

  const prisma: PrismaStub = {
    chatMessage: {
      create: async ({ data, select }: any) => {
        messages.push(data);
        const base = {
          id: `msg-${messages.length}`,
          text: data.text ?? null,
          type: data.type ?? MessageType.TEXT,
          attachmentUrl: data.attachmentUrl ?? null,
          attachmentMeta: data.attachmentMeta,
          createdAt: new Date(),
        };
        return select
          ? Object.fromEntries(
              Object.keys(select).map((k) => [k, (base as any)[k]]),
            )
          : base;
      },
    },
    chatSession: {
      update: async (args: any) => {
        sessions.push(args);
        return args;
      },
    },
    memoryItem: {
      findUnique: async ({ where }: any) => memory[keyFrom(where)],
      upsert: async ({ where, update, create }: any) => {
        const k = keyFrom(where);
        if (memory[k]) {
          memory[k] = { ...memory[k], ...update };
        } else {
          memory[k] = create;
        }
        return memory[k];
      },
    },
  };

  return { prisma, messages, sessions, memory };
}

const baseCtx: ActionContext = {
  bot: { id: "bot-1", tenant: "tenant-1", secret: { channelAccessToken: "tok" } },
  session: { id: "session-1" },
  platform: "line",
  userId: "user-1",
  requestId: "req-actions",
  log: createRequestLogger("req-actions"),
};

async function testSendMessage() {
  const { prisma, messages } = makePrismaStub();
  const broadcasts: any[] = [];
  const result = await executeSendAction(
    { type: "send_message", message: { text: "hi", type: MessageType.TEXT } },
    baseCtx,
    {
      prisma: prisma as any,
      enqueueRateLimitedSend: async () => ({ scheduled: false, result: true }),
      recordDeliveryMetric: () => {},
      sendLinePushMessage: async () => true,
      sendTelegramPayload: async () => true,
      safeBroadcast: (evt: any) => broadcasts.push(evt),
    },
  );

  assert.equal(result.status, "handled");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, MessageType.TEXT);
  assert.ok(broadcasts[0]);
}

async function testSendImageWithMeta() {
  const { prisma, messages } = makePrismaStub();
  await executeSendAction(
    {
      type: "send_message",
      message: {
        type: MessageType.IMAGE,
        text: "pic",
        attachmentUrl: "https://img",
        attachmentMeta: { width: 100, height: 200 },
      },
    },
    baseCtx,
    {
      prisma: prisma as any,
      enqueueRateLimitedSend: async () => ({ scheduled: false, result: true }),
      recordDeliveryMetric: () => {},
      sendLinePushMessage: async () => true,
      sendTelegramPayload: async () => true,
      safeBroadcast: () => {},
    },
  );

  assert.equal(messages[0].type, MessageType.IMAGE);
  assert.equal(messages[0].attachmentUrl, "https://img");
  assert.deepEqual(messages[0].attachmentMeta, { width: 100, height: 200 });
}

async function testTagActions() {
  const { prisma, memory, messages } = makePrismaStub();
  await executeTagAction({ type: "tag_add", tag: "vip" }, baseCtx, prisma as any);
  await executeTagAction({ type: "tag_remove", tag: "vip" }, baseCtx, prisma as any);
  const tagEntry = memory["tenant-1:session-1:tags"];
  assert.ok(tagEntry);
  assert.deepEqual(tagEntry.tags ?? JSON.parse(tagEntry.value), []);
  // system notes were created
  assert.ok(messages.length >= 2);
}

async function testSegmentAction() {
  const { prisma, memory } = makePrismaStub();
  await executeSegmentAction({ type: "segment_update", segment: { tier: "gold" } }, baseCtx, prisma as any);
  const segmentEntry = memory["tenant-1:session-1:segment"];
  assert.ok(segmentEntry);
  assert.ok(String(segmentEntry.value).includes("gold"));
}

async function testFollowUp() {
  const scheduled: any[] = [];
  const sendCalls: any[] = [];
  const res = await executeFollowUpAction(
    {
      type: "follow_up",
      delaySeconds: 1,
      message: { text: "later" },
    },
    baseCtx,
    {
      enqueueFollowUpJob: async (job) => {
        scheduled.push(job);
        return job.id;
      },
      sendAction: async (action, ctx) => {
        sendCalls.push({ action, ctx });
      },
    } as any,
  );

  assert.equal(res.status, "scheduled");
  assert.equal(scheduled.length, 1);
  await scheduled[0].handler(scheduled[0].payload);
  assert.equal(sendCalls.length, 1);
}

(async () => {
  await testSendMessage();
  await testSendImageWithMeta();
  await testTagActions();
  await testSegmentAction();
  await testFollowUp();
  console.log("actions.test.ts passed");
})();
