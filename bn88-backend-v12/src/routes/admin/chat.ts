// src/routes/admin/chat.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { config } from "../../config";
import { sseHub } from "../../lib/sseHub";
import { sendTelegramMessage } from "../../services/telegram";
import { MessageType } from "@prisma/client";
import { z } from "zod";

const router = Router();
const TENANT_DEFAULT = process.env.TENANT_DEFAULT || "bn9";
const MESSAGE_TYPES: MessageType[] = [
  "TEXT",
  "IMAGE",
  "FILE",
  "STICKER",
  "SYSTEM",
];

const replyPayloadSchema = z.object({
  type: z
    .enum(MESSAGE_TYPES as [MessageType, MessageType, MessageType, MessageType, MessageType])
    .optional(),
  text: z.string().optional(),
  attachmentUrl: z.string().url().optional(),
  attachmentMeta: z.any().optional(),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function getTenant(req: Request): string {
  return (
    (req.headers["x-tenant"] as string) ||
    config.TENANT_DEFAULT ||
    TENANT_DEFAULT
  );
}

async function sendLinePushMessage(
  channelAccessToken: string,
  toUserId: string,
  text: string
): Promise<boolean> {
  if (!channelAccessToken) {
    console.error("[LINE push] missing channelAccessToken");
    return false;
  }

  const f = (globalThis as any).fetch as typeof fetch | undefined;
  if (!f) {
    console.error("[LINE push] global fetch is not available");
    return false;
  }

  const resp = await f("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: toUserId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.warn("[LINE push warning]", resp.status, t);
    return false;
  }

  return true;
}

function buildLineMessage(
  type: MessageType,
  text: string,
  attachmentUrl?: string | null,
  attachmentMeta?: Record<string, unknown>
) {
  if (type === "IMAGE" && attachmentUrl) {
    return {
      type: "image",
      originalContentUrl: attachmentUrl,
      previewImageUrl: attachmentUrl,
    } as any;
  }

  if (type === "STICKER" && attachmentMeta?.packageId && attachmentMeta?.stickerId) {
    return {
      type: "sticker",
      packageId: String(attachmentMeta.packageId),
      stickerId: String(attachmentMeta.stickerId),
    } as any;
  }

  if (type === "FILE" && attachmentUrl) {
    return {
      type: "text",
      text: `${text || "ไฟล์แนบ"}: ${attachmentUrl}`,
    } as any;
  }

  return { type: "text", text: text || "" } as any;
}

async function sendLineRichMessage(
  channelAccessToken: string,
  toUserId: string,
  type: MessageType,
  text: string,
  attachmentUrl?: string | null,
  attachmentMeta?: Record<string, unknown>
): Promise<boolean> {
  const f = (globalThis as any).fetch as typeof fetch | undefined;
  if (!f) {
    console.error("[LINE push] global fetch is not available");
    return false;
  }

  const message = buildLineMessage(type, text, attachmentUrl, attachmentMeta);
  const resp = await f("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: toUserId,
      messages: [message],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.warn("[LINE push warning]", resp.status, t);
    return false;
  }

  return true;
}

async function sendTelegramRich(
  token: string,
  chatId: string,
  type: MessageType,
  text: string,
  attachmentUrl?: string | null,
  attachmentMeta?: Record<string, unknown>,
  replyToMessageId?: string | number
): Promise<boolean> {
  const f = (globalThis as any).fetch as typeof fetch | undefined;
  if (!f) {
    console.error("[Telegram] global fetch is not available");
    return false;
  }

  try {
    if (type === "IMAGE" && attachmentUrl) {
      const resp = await f(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: attachmentUrl,
          caption: text || undefined,
          reply_to_message_id: replyToMessageId,
        }),
      });
      return resp.ok;
    }

    if (type === "FILE" && attachmentUrl) {
      const resp = await f(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          document: attachmentUrl,
          caption: text || undefined,
          reply_to_message_id: replyToMessageId,
        }),
      });
      return resp.ok;
    }

    if (type === "STICKER" && attachmentMeta?.stickerId) {
      const resp = await f(`https://api.telegram.org/bot${token}/sendSticker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          sticker: String(attachmentMeta.stickerId),
          reply_to_message_id: replyToMessageId,
        }),
      });
      return resp.ok;
    }

    // default to text
    return await sendTelegramMessage(token, chatId, text, replyToMessageId);
  } catch (err) {
    console.error("[Telegram] send rich error", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/admin/chat/sessions                                       */
/* ------------------------------------------------------------------ */

router.get("/sessions", async (req: Request, res: Response) => {
  try {
    const tenant = getTenant(req);
    const botId =
      typeof req.query.botId === "string" ? req.query.botId : undefined;
    const platform =
      typeof req.query.platform === "string"
        ? (req.query.platform as string)
        : undefined;
    const limit = Number(req.query.limit) || 50;

    const sessions = await prisma.chatSession.findMany({
      where: {
        tenant,
        ...(botId ? { botId } : {}),
        ...(platform ? { platform } : {}),
      },
      orderBy: { lastMessageAt: "desc" },
      take: limit,
    });

    return res.json({ ok: true, sessions, items: sessions });
  } catch (err) {
    console.error("[admin chat] list sessions error", err);
    return res
      .status(500)
      .json({ ok: false, message: "internal_error_list_sessions" });
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/admin/chat/sessions/:id/messages                          */
/* ------------------------------------------------------------------ */

router.get(
  "/sessions/:id/messages",
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const tenant = getTenant(req);
      const sessionId = String(req.params.id);
      const limit = Number(req.query.limit) || 200;

      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, tenant },
      });

      if (!session) {
        return res
          .status(404)
          .json({ ok: false, message: "chat_session_not_found" });
      }

      const messages = await prisma.chatMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "asc" },
        take: limit,
      });

      return res.json({ ok: true, session, messages, items: messages });
    } catch (err) {
      console.error("[admin chat] list messages error", err);
      return res
        .status(500)
        .json({ ok: false, message: "internal_error_list_messages" });
    }
  }
);

/* ------------------------------------------------------------------ */
/* POST /api/admin/chat/sessions/:id/reply                            */
/* ------------------------------------------------------------------ */

router.post(
  "/sessions/:id/reply",
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const tenant = getTenant(req);
      const sessionId = String(req.params.id);
      const parsed = replyPayloadSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "invalid_payload" });
      }

      const { text, attachmentUrl, attachmentMeta, type: rawType } = parsed.data;
      const messageType: MessageType = rawType ?? "TEXT";
      const messageText = (text ?? "").trim();

      if (!messageText && !attachmentUrl) {
        return res
          .status(400)
          .json({ ok: false, message: "text_or_attachment_required" });
      }

      const fallbackText = messageText || `[${messageType.toLowerCase()}]`;

      // หา session
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, tenant },
      });

      if (!session) {
        return res
          .status(404)
          .json({ ok: false, message: "chat_session_not_found" });
      }

      // หา bot + secret
      const bot = await prisma.bot.findUnique({
        where: { id: session.botId },
        include: { secret: true },
      });

      if (!bot) {
        return res
          .status(404)
          .json({ ok: false, message: "bot_not_found_for_session" });
      }

      const platform = session.platform;
      let delivered = false;

      // ส่งข้อความออกไปตาม platform
      if (platform === "telegram") {
        const token = bot.secret?.telegramBotToken;
        if (!token) {
          console.warn(
            "[admin chat reply] telegramBotToken missing for bot",
            bot.id
          );
        } else {
          try {
            // สำหรับแชทส่วนตัว userId มักเท่ากับ chatId
            delivered = await sendTelegramRich(
              token,
              session.userId,
              messageType,
              messageText,
              attachmentUrl,
              (attachmentMeta as any) ?? undefined
            );
          } catch (err) {
            console.error("[admin chat reply] telegram send error", err);
          }
        }
      } else if (platform === "line") {
        const token = bot.secret?.channelAccessToken;
        if (!token) {
          console.warn(
            "[admin chat reply] LINE channelAccessToken missing for bot",
            bot.id
          );
        } else {
          try {
            delivered = await sendLineRichMessage(
              token,
              session.userId,
              messageType,
              fallbackText,
              attachmentUrl,
              (attachmentMeta as any) ?? undefined
            );
          } catch (err) {
            console.error("[admin chat reply] line push error", err);
          }
        }
      } else {
        console.warn(
          "[admin chat reply] unsupported platform",
          platform,
          "sessionId=",
          session.id
        );
      }

      // บันทึกข้อความฝั่ง admin ลง ChatMessage
      const now = new Date();
      const adminMsg = await prisma.chatMessage.create({
        data: {
          tenant: session.tenant,
          botId: session.botId,
          platform: session.platform,
          sessionId: session.id,
          senderType: "admin",
          type: messageType,
          text: messageText || null,
          attachmentUrl: attachmentUrl ?? null,
          attachmentMeta: attachmentMeta ?? null,
          meta: {
            via: "admin_reply",
            delivered,
          } as any,
        },
        select: {
          id: true,
          text: true,
          type: true,
          attachmentUrl: true,
          attachmentMeta: true,
          createdAt: true,
        },
      });

      // อัปเดต session
      await prisma.chatSession.update({
        where: { id: session.id },
        data: {
          lastMessageAt: now,
          lastText: messageText || fallbackText,
          lastDirection: "admin",
        },
      });

      // broadcast SSE ไปหน้า Dashboard / Chat Center
      try {
        sseHub.broadcast({
          type: "chat:message:new",
          tenant: session.tenant,
          botId: session.botId,
          sessionId: session.id,
          message: {
            id: adminMsg.id,
            senderType: "admin",
            text: adminMsg.text,
            type: adminMsg.type,
            attachmentUrl: adminMsg.attachmentUrl,
            attachmentMeta: adminMsg.attachmentMeta,
            createdAt: adminMsg.createdAt,
          },
        } as any);
      } catch (sseErr) {
        console.warn("[admin chat reply] SSE broadcast warn", sseErr);
      }

      return res.json({
        ok: true,
        delivered,
        messageId: adminMsg.id,
      });
    } catch (err) {
      console.error("[admin chat reply] fatal error", err);
      return res
        .status(500)
        .json({ ok: false, message: "internal_error_reply" });
    }
  }
);

/* ------------------------------------------------------------------ */

export default router;
export { router as chatAdminRouter };
