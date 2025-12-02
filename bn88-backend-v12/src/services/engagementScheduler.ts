import { prisma } from "../lib/prisma";
import { scheduleMessageJob } from "../queues/message.queue";
import { sendTelegramMessage, sendTelegramPoll } from "./telegram";
import { sendLinePushMessage } from "./line";
import { createRequestLogger } from "../utils/logger";

async function dispatchEngagement(messageId: string, requestId?: string) {
  const log = createRequestLogger(requestId || messageId);
  const msg = await prisma.engagementMessage.findUnique({ where: { id: messageId } });
  if (!msg || !msg.enabled) return;

  const bot = await prisma.bot.findUnique({ where: { id: msg.botId } });
  if (!bot) {
    log.warn("[engagement] bot missing", { botId: msg.botId });
    return;
  }
  const botSecret = await prisma.botSecret.findUnique({ where: { botId: msg.botId } });
  if (!botSecret) {
    log.warn("[engagement] bot secret missing", { botId: msg.botId });
    return;
  }

  const meta = (msg.meta as any) || {};

  if (process.env.NODE_ENV === "test") {
    log.info("[engagement] test mode skip external send", { id: msg.id });
  } else if (msg.platform === "telegram" && botSecret.telegramBotToken) {
    const pollOptions: string[] | undefined = Array.isArray(meta.pollOptions)
      ? (meta.pollOptions as string[])
      : undefined;
    if (msg.type === "poll" && pollOptions && pollOptions.length >= 2) {
      await sendTelegramPoll(botSecret.telegramBotToken, msg.channelId, msg.text, pollOptions);
    } else {
      await sendTelegramMessage(botSecret.telegramBotToken, msg.channelId, msg.text);
    }
  } else if (msg.platform === "line" && botSecret.channelAccessToken) {
    await sendLinePushMessage({
      channelAccessToken: botSecret.channelAccessToken,
      to: msg.channelId,
      text: msg.text,
    });
  }

  await prisma.engagementMessage.update({
    where: { id: msg.id },
    data: { lastSentAt: new Date() },
  });

  await prisma.chatMessage.create({
    data: {
      tenant: bot.tenant,
      botId: msg.botId,
      platform: msg.platform,
      sessionId: null,
      conversationId: null,
      senderType: "bot",
      type: "SYSTEM",
      text: msg.text,
      meta: { via: "engagement", engagementId: msg.id, type: msg.type },
    },
  });

  log.info("[engagement] dispatched", { id: msg.id, platform: msg.platform });
}

export async function scheduleEngagementMessage(message: { id: string; channelId: string; interval: number }, requestId?: string) {
  const log = createRequestLogger(requestId || message.id);
  const timezone = process.env.TZ || "UTC";
  const cronExpr = `*/${Math.max(1, message.interval)} * * * *`;

  if (process.env.NODE_ENV === "test") {
    log.info("[engagement] test mode skip schedule", { id: message.id });
    return;
  }

  await scheduleMessageJob({
    id: `engagement:${message.id}`,
    channelId: message.channelId,
    cron: cronExpr,
    timezone,
    handler: () => dispatchEngagement(message.id, requestId),
    requestId,
  });

  log.info("[engagement] scheduled", { id: message.id, cron: cronExpr });
}

export async function startEngagementScheduler(requestId?: string) {
  const log = createRequestLogger(requestId || "engagement");
  const items = await prisma.engagementMessage.findMany({ where: { enabled: true } });

  for (const item of items) {
    await scheduleEngagementMessage(item, requestId);
  }

  log.info("[engagement] scheduler registered", { count: items.length });
}

export async function triggerEngagementOnce(id: string, requestId?: string) {
  return dispatchEngagement(id, requestId);
}
