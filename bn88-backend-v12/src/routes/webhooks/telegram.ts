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
  chat: TgChat;
  from?: TgUser;
};
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  [key: string]: unknown;
};

function isTextMessage(msg: any): msg is TgMessage & { text: string } {
  return (
    !!msg &&
    typeof msg.text === "string" &&
    !!msg.chat &&
    (typeof msg.chat.id === "number" || typeof msg.chat.id === "string")
  );
}

function mapTelegramMessage(msg?: TgMessage) {
  if (!msg || !msg.chat) return null;

  if (msg.photo && msg.photo.length > 0) {
    const best = msg.photo[msg.photo.length - 1];
    return {
      type: "IMAGE" as MessageType,
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
      type: "FILE" as MessageType,
      text: msg.text ?? msg.caption ?? msg.document.file_name ?? "",
      attachmentUrl: undefined,
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
      type: "STICKER" as MessageType,
      text: msg.text ?? "",
      attachmentUrl: undefined,
      attachmentMeta: {
        fileId: msg.sticker.file_id,
        setName: msg.sticker.set_name,
        width: msg.sticker.width,
        height: msg.sticker.height,
      },
    };
  }

  if (isTextMessage(msg)) {
    return {
      type: "TEXT" as MessageType,
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
  try {
    const tenant =
      (req.headers["x-tenant"] as string) || config.TENANT_DEFAULT || "bn9";

    const botIdParam =
      typeof req.query.botId === "string" ? req.query.botId : undefined;

    const picked = await resolveBot(tenant, botIdParam);
    if (!picked) {
      console.error(
        "[TELEGRAM webhook] bot not configured for tenant:",
        tenant
      );
      return res
        .status(400)
        .json({ ok: false, message: "telegram_bot_not_configured" });
    }

    const { botId, tenant: botTenant, botToken } = picked;
    const update = req.body as TgUpdate;

    if (!update || !update.message) {
      console.log("[TELEGRAM] skip update (no message)", update?.message);
      return res
        .status(200)
        .json({ ok: true, skipped: true, reason: "no_message" });
    }

    const mapped = mapTelegramMessage(update.message);
    if (!mapped) {
      console.log("[TELEGRAM] skip update (unsupported message)", update.message);
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
      messageType: mapped.type,
      attachmentUrl: mapped.attachmentUrl,
      attachmentMeta: mapped.attachmentMeta,
      displayName: from?.first_name || from?.username,
      platformMessageId,
      rawPayload: update,
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
      console.warn("[TELEGRAM] skip send (no reply or no botToken)", {
        hasReply,
        hasBotToken,
      });
    }

    console.log("[TELEGRAM] handled message", {
      botId,
      tenant: botTenant,
      userId,
      platformMessageId,
      hasReply,
      hasBotToken,
      intent,
      isIssue,
      replied,
    });

    return res.status(200).json({ ok: true, replied, intent, isIssue });
  } catch (e) {
    console.error("[TELEGRAM WEBHOOK ERROR]", e);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

export default router;
export { router as telegramWebhookRouter };
