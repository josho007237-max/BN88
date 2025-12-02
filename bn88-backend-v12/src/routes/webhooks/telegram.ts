// src/routes/webhooks/telegram.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { config } from "../../config";
import {
  processIncomingMessage,
  type SupportedPlatform,
} from "../../services/inbound/processIncomingMessage";
import { sendTelegramMessage } from "../../services/telegram";
import { MessageType } from "@prisma/client";
import { createRequestLogger, getRequestId } from "../../utils/logger";

const router = Router();

type TgChat = { id: number | string; type: string };
type TgUser = {
  id: number | string;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
};
type TgMessage = {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; file_size?: number; width?: number; height?: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  sticker?: { file_id: string; set_name?: string; width?: number; height?: number };
  location?: { latitude: number; longitude: number; horizontal_accuracy?: number };
  chat: TgChat;
  from?: TgUser;
};
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  [key: string]: unknown;
};

type TgCallbackQuery = {
  id: string;
  data?: string;
  from?: TgUser;
  message?: TgMessage;
};

function isTextMessage(msg: any): msg is TgMessage & { text: string } {
  return (
    !!msg &&
    typeof msg.text === "string" &&
    !!msg.chat &&
    (typeof msg.chat.id === "number" || typeof msg.chat.id === "string")
  );
}

export type NormalizedTelegramMessage = {
  messageType: MessageType;
  text: string;
  attachmentUrl?: string | null;
  attachmentMeta?: Record<string, unknown> | null;
};

export function mapTelegramCallback(
  cb?: TgCallbackQuery
): NormalizedTelegramMessage | null {
  if (!cb || !cb.message) return null;

  return {
    messageType: MessageType.INLINE_KEYBOARD,
    text: cb.data ?? "callback",
    attachmentUrl: undefined,
    attachmentMeta: {
      callbackId: cb.id,
      callbackData: cb.data,
      messageId: cb.message.message_id,
      fromUserId: cb.from?.id,
    },
  };
}

export function mapTelegramMessage(msg?: TgMessage): NormalizedTelegramMessage | null {
  if (!msg || !msg.chat) return null;

  if (msg.photo && msg.photo.length > 0) {
    const best = msg.photo[msg.photo.length - 1];
    return {
      messageType: MessageType.IMAGE,
      text: msg.text ?? msg.caption ?? "",
      attachmentUrl: undefined,
      attachmentMeta: {
        fileId: best.file_id,
        width: best.width,
        height: best.height,
        fileSize: best.file_size,
      },
    };
  }

  if (msg.document) {
    return {
      messageType: MessageType.FILE,
      text: msg.text ?? msg.caption ?? msg.document.file_name ?? "",
      attachmentUrl: msg.document.file_id
        ? `tg:file/${msg.document.file_id}`
        : undefined,
      attachmentMeta: {
        fileId: msg.document.file_id,
        fileName: msg.document.file_name,
        mimeType: msg.document.mime_type,
        fileSize: msg.document.file_size,
      },
    };
  }

  if (msg.sticker) {
    return {
      messageType: MessageType.STICKER,
      text: msg.text ?? "",
      attachmentUrl: msg.sticker.file_id
        ? `tg:sticker/${msg.sticker.file_id}`
        : undefined,
      attachmentMeta: {
        fileId: msg.sticker.file_id,
        setName: msg.sticker.set_name,
        width: msg.sticker.width,
        height: msg.sticker.height,
      },
    };
  }

  if (msg.location) {
    return {
      messageType: MessageType.SYSTEM,
      text: msg.text ?? msg.caption ?? "location",
      attachmentUrl: `https://www.google.com/maps/search/?api=1&query=${msg.location.latitude},${msg.location.longitude}`,
      attachmentMeta: {
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
        horizontalAccuracy: msg.location.horizontal_accuracy,
      },
    };
  }

  if (isTextMessage(msg)) {
    return {
      messageType: MessageType.TEXT,
      text: msg.text ?? "",
      attachmentUrl: undefined,
      attachmentMeta: undefined,
    };
  }

  return null;
}

async function resolveBot(tenant: string, botIdParam?: string) {
  let bot: { id: string; tenant: string } | null = null;

  if (botIdParam) {
    bot = await prisma.bot.findFirst({
      where: { id: botIdParam, tenant, platform: "telegram" },
      select: { id: true, tenant: true },
    });
  }

  if (!bot) {
    bot =
      (await prisma.bot.findFirst({
        where: { tenant, platform: "telegram", active: true },
        select: { id: true, tenant: true },
      })) ??
      (await prisma.bot.findFirst({
        where: { tenant, platform: "telegram" },
        select: { id: true, tenant: true },
      }));
  }

  if (!bot?.id) return null;

  const sec = await prisma.botSecret.findFirst({
    where: { botId: bot.id },
    select: { telegramBotToken: true },
  });

  return {
    botId: bot.id,
    tenant: bot.tenant ?? tenant,
    botToken: sec?.telegramBotToken || "",
  };
}

router.post("/", async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const log = createRequestLogger(requestId);
  try {
    const tenant =
      (req.headers["x-tenant"] as string) || config.TENANT_DEFAULT || "bn9";

    const botIdParam =
      typeof req.query.botId === "string" ? req.query.botId : undefined;

    const picked = await resolveBot(tenant, botIdParam);
    if (!picked) {
      log.error("[TELEGRAM webhook] bot not configured for tenant", tenant);
      return res
        .status(400)
        .json({ ok: false, message: "telegram_bot_not_configured" });
    }

    const { botId, tenant: botTenant, botToken } = picked;
    const update = req.body as TgUpdate;

    if (update?.callback_query) {
      const cb = update.callback_query;
      const mappedCallback = mapTelegramCallback(cb);
      if (!mappedCallback) {
        log.info("[TELEGRAM] skip callback (cannot map)", cb);
        return res.status(200).json({ ok: true, skipped: true, reason: "no_callback" });
      }

      const platformUserId = String(
        cb.from?.id ?? cb.message?.chat?.id ?? cb.message?.from?.id ?? ""
      );
      if (!platformUserId) {
        log.info("[TELEGRAM] skip callback (no user)", cb);
        return res.status(200).json({ ok: true, skipped: true, reason: "no_user" });
      }

      await processIncomingMessage({
        botId,
        platform: "telegram" as SupportedPlatform,
        userId: platformUserId,
        text: mappedCallback.text,
        rawPayload: cb,
        platformMessageId: String(cb.id),
        messageType: mappedCallback.messageType,
        attachmentUrl: mappedCallback.attachmentUrl ?? undefined,
        attachmentMeta: mappedCallback.attachmentMeta ?? undefined,
        requestId,
      });

      const f = (globalThis as any).fetch as typeof fetch | undefined;
      if (f && cb.id) {
        void f(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cb.id }),
        }).catch((err: any) => log.warn("[TELEGRAM] answerCallbackQuery warn", err));
      }

      return res.status(200).json({ ok: true, handled: "callback" });
    }

    if (!update || !update.message) {
      log.info("[TELEGRAM] skip update (no message)", update?.message);
      return res
        .status(200)
        .json({ ok: true, skipped: true, reason: "no_message" });
    }

    const mapped = mapTelegramMessage(update.message);
    if (!mapped) {
      log.info("[TELEGRAM] skip update (unsupported message)", update.message);
      return res
        .status(200)
        .json({ ok: true, skipped: true, reason: "unsupported_message" });
    }

    const msg = update.message;
    const chat = msg.chat;
    const from = msg.from;

    const userId = String(from?.id ?? chat.id);
    const text = mapped.text ?? "";
    const platform: SupportedPlatform = "telegram";
    const platformMessageId = String(msg.message_id);

    const { reply, intent, isIssue } = await processIncomingMessage({
      botId,
      platform,
      userId,
      text,
      messageType: mapped.messageType,
      attachmentUrl: mapped.attachmentUrl ?? undefined,
      attachmentMeta: mapped.attachmentMeta ?? undefined,
      displayName: from?.first_name || from?.username,
      platformMessageId,
      rawPayload: update,
      requestId,
    });

    const hasReply = !!reply?.trim();
    const hasBotToken = !!botToken;

    let replied = false;
    if (hasReply && hasBotToken) {
      replied = await sendTelegramMessage(
        botToken,
        chat.id,
        reply,
        msg.message_id
      );
    } else {
      log.warn("[TELEGRAM] skip send (no reply or no botToken)", {
        hasReply,
        hasBotToken,
      });
    }

    log.info("[TELEGRAM] handled message", {
      botId,
      tenant: botTenant,
      userId,
      platformMessageId,
      hasReply,
      hasBotToken,
      intent,
      isIssue,
      replied,
      requestId,
    });

    return res
      .status(200)
      .json({ ok: true, replied, intent, isIssue, requestId });
  } catch (e) {
    log.error("[TELEGRAM WEBHOOK ERROR]", e);
    return res.status(500).json({ ok: false, message: "internal_error", requestId });
  }
});

export default router;
export { router as telegramWebhookRouter };
