import { MessageType } from "@prisma/client";
import { enqueueRateLimitedSend } from "../../queues/message.queue";
import { recordDeliveryMetric } from "../../routes/metrics.live";
import { sendTelegramMessage } from "../telegram";
import { prisma } from "../../lib/prisma";
import { createRequestLogger } from "../../utils/logger";
import {
  ActionContext,
  ActionExecutionResult,
  ActionMessagePayload,
  SendMessageAction,
} from "./types";
import { normalizeActionMessage, safeBroadcast } from "./utils";

async function sendLinePushMessage(args: {
  channelAccessToken?: string | null;
  to: string;
  payload: Required<ActionMessagePayload>;
}) {
  const { channelAccessToken, to, payload } = args;
  if (!channelAccessToken) return false;

  const f = (globalThis as any).fetch as typeof fetch | undefined;
  if (!f) return false;

  const messages: any[] = [];

  if (payload.type === MessageType.IMAGE && payload.attachmentUrl) {
    messages.push({
      type: "image",
      originalContentUrl: payload.attachmentUrl,
      previewImageUrl: payload.attachmentUrl,
    });
  } else if (payload.type === MessageType.FILE && payload.attachmentUrl) {
    messages.push({ type: "text", text: payload.text || payload.attachmentUrl });
  } else if (payload.type === MessageType.STICKER) {
    messages.push({ type: "text", text: payload.text || "[sticker]" });
  } else if (payload.type === MessageType.SYSTEM) {
    messages.push({ type: "text", text: payload.text || "[system]" });
  } else {
    messages.push({ type: "text", text: payload.text || "" });
  }

  const resp = await f("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
  });

  return resp.ok;
}

async function sendTelegramPayload(args: {
  botToken?: string | null;
  chatId: string;
  payload: Required<ActionMessagePayload>;
}) {
  const { botToken, chatId, payload } = args;
  if (!botToken) return false;

  const options = {
    photoUrl:
      payload.type === MessageType.IMAGE ? payload.attachmentUrl ?? undefined : undefined,
    documentUrl:
      payload.type === MessageType.FILE ? payload.attachmentUrl ?? undefined : undefined,
    documentName:
      payload.type === MessageType.FILE
        ? (payload.attachmentMeta as any)?.fileName ?? undefined
        : undefined,
  };

  const textForTg = payload.text || payload.attachmentUrl || "";
  return sendTelegramMessage(botToken, chatId, textForTg, undefined, options);
}

const defaultDeps = {
  prisma,
  enqueueRateLimitedSend,
  recordDeliveryMetric,
  sendLinePushMessage,
  sendTelegramPayload,
  safeBroadcast,
};

type SendDeps = typeof defaultDeps;

export async function executeSendAction(
  action: SendMessageAction,
  ctx: ActionContext,
  deps: SendDeps = defaultDeps,
): Promise<ActionExecutionResult> {
  const { bot, session, platform, userId, log } = ctx;
  const normalized = normalizeActionMessage(
    action.message,
    action.message.attachmentUrl ? "attachment" : "",
  );

  try {
    const now = new Date();
    const botChatMessage = await deps.prisma.chatMessage.create({
      data: {
        tenant: bot.tenant,
        botId: bot.id,
        platform,
        sessionId: session.id,
        conversationId: ctx.conversation?.id,
        senderType: "bot",
        type: normalized.type,
        text: normalized.text || "",
        attachmentUrl: normalized.attachmentUrl ?? null,
        attachmentMeta: normalized.attachmentMeta ?? undefined,
        meta: { source: platform, via: "action" },
      },
      select: {
        id: true,
        text: true,
        type: true,
        conversationId: true,
        attachmentUrl: true,
        attachmentMeta: true,
        createdAt: true,
      },
    });

    await deps.prisma.chatSession.update({
      where: { id: session.id },
      data: {
        lastMessageAt: now,
        lastText: normalized.text || normalized.attachmentUrl || undefined,
        lastDirection: "bot",
      },
    });

    deps.safeBroadcast({
      type: "chat:message:new",
      tenant: bot.tenant,
      botId: bot.id,
      sessionId: session.id,
      message: botChatMessage,
    });

    const rateLimited = await deps.enqueueRateLimitedSend({
      id: `${botChatMessage.id}:send`,
      channelId: `${platform}:${bot.id}`,
      requestId: ctx.requestId,
      handler: async () => {
        if (platform === "line") {
          return deps.sendLinePushMessage({
            channelAccessToken: bot.secret?.channelAccessToken,
            to: userId,
            payload: normalized,
          });
        }
        if (platform === "telegram") {
          return deps.sendTelegramPayload({
            botToken: bot.secret?.telegramBotToken,
            chatId: userId,
            payload: normalized,
          });
        }
        return false;
      },
    });

    const delivered = rateLimited.scheduled ? false : Boolean(rateLimited.result);

    deps.recordDeliveryMetric(`${platform}:${bot.id}`, delivered, ctx.requestId);

    if (rateLimited.scheduled) {
      log.warn("[action] send_message rate-limited", {
        sessionId: session.id,
        platform,
        requestId: ctx.requestId,
        delayMs: rateLimited.delayMs,
      });
    }

    log.info("[action] send_message", {
      sessionId: session.id,
      platform,
      delivered,
      type: normalized.type,
      requestId: ctx.requestId,
    });

    return {
      type: action.type,
      status: delivered ? "handled" : "skipped",
      detail: delivered ? "sent_to_platform" : "stored_only",
    };
  } catch (err) {
    log.error("[action] send_message error", err);
    deps.recordDeliveryMetric(`${platform}:${bot.id}`, false, ctx.requestId);
    return { type: action.type, status: "error", detail: String(err) };
  }
}
