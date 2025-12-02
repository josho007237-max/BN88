// src/routes/admin/chat.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { config } from "../../config";
import { sseHub } from "../../lib/sseHub";
import { sendTelegramMessage } from "../../services/telegram";
import { MessageType } from "@prisma/client";
import { z } from "zod";
import { recordDeliveryMetric } from "../metrics.live";
import { createRequestLogger, getRequestId } from "../../utils/logger";
import { requirePermission } from "../../middleware/basicAuth";
import { ensureConversation } from "../../services/conversation";
import {
  buildFlexMessage,
  type FlexButton,
  type FlexMessageInput,
} from "../../services/lineFlex";

const router = Router();
const TENANT_DEFAULT = process.env.TENANT_DEFAULT || "bn9";
const MESSAGE_TYPES = [
  "TEXT",
  "IMAGE",
  "FILE",
  "STICKER",
  "SYSTEM",
  "RICH",
  "INLINE_KEYBOARD",
] as const satisfies MessageType[];

const replyPayloadSchema = z.object({
  type: z
    .enum(MESSAGE_TYPES as [MessageType, ...MessageType[]])
    .optional(),
  text: z.string().optional(),
  attachmentUrl: z.string().url().optional(),
  attachmentMeta: z.any().optional(),
});

const flexButtonSchema = z.object({
  label: z.string().min(1),
  action: z.enum(["uri", "message", "postback"] as const),
  value: z.string().min(1),
});

const richPayloadSchema = z.object({
  sessionId: z.string().min(1),
  platform: z.enum(["line", "telegram"]).optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  imageUrl: z.string().url().optional(),
  buttons: z.array(flexButtonSchema).optional(),
  inlineKeyboard: z
    .array(z.array(z.object({ text: z.string().min(1), callbackData: z.string().min(1) })))
    .optional(),
  altText: z.string().optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(500).optional(),
  platform: z.string().optional(),
  botId: z.string().optional(),
  userId: z.string().optional(),
});

const messagesQuerySchema = z.object({
  conversationId: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getTenant(req: Request): string {
  return (
    (req.headers["x-tenant"] as string) ||
    config.TENANT_DEFAULT ||
    TENANT_DEFAULT
  );
}

type PrismaLike = typeof prisma;

type MessagesQuery = {
  tenant: string;
  conversationId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
  requestId?: string;
};

async function fetchAdminChatMessages(
  params: MessagesQuery,
  client: PrismaLike = prisma
): Promise<{ conversationId: string | null; items: any[]; conversation?: any }>
{
  const { tenant, conversationId, sessionId, limit = 200, offset = 0, requestId } = params;
  if (!conversationId && !sessionId) {
    throw new HttpError(400, "conversationId_or_sessionId_required");
  }

  const log = createRequestLogger(requestId);

  let conversation: any | null = null;
  if (conversationId) {
    conversation = await client.conversation.findFirst({
      where: { id: conversationId, tenant },
      select: { id: true, botId: true, userId: true },
    });
    if (!conversation) {
      throw new HttpError(404, "conversation_not_found");
    }
  }

  let session: any | null = null;
  if (!conversationId && sessionId) {
    session = await client.chatSession.findFirst({
      where: { id: sessionId, tenant },
      select: { id: true, botId: true, platform: true, userId: true },
    });
    if (!session) {
      throw new HttpError(404, "chat_session_not_found");
    }
    conversation = await client.conversation.findFirst({
      where: { botId: session.botId, userId: session.userId, tenant },
      select: { id: true, botId: true, userId: true },
    });
  }

  const whereClause = conversationId
    ? { conversationId }
    : { sessionId: session?.id };

  const messages = await client.chatMessage.findMany({
    where: whereClause,
    orderBy: { createdAt: "asc" },
    skip: offset,
    take: limit,
    include: {
      conversation: { select: { id: true, botId: true, userId: true } },
      session: { select: { userId: true, platform: true } },
    },
  });

  const resolvedConversation =
    conversation ?? messages[0]?.conversation ?? undefined;

  log.info(
    `[Admin] chat/messages conversationId=${
      resolvedConversation?.id ?? conversationId ?? null
    } count=${messages.length}`
  );

  const items = messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId ?? resolvedConversation?.id ?? null,
    sessionId: m.sessionId,
    userId: m.session?.userId ?? null,
    platform: m.platform,
    text: m.text,
    createdAt: m.createdAt,
    meta: m.meta,
    attachmentUrl: m.attachmentUrl,
    attachmentMeta: m.attachmentMeta,
    type: m.type,
  }));

  return {
    conversationId: resolvedConversation?.id ?? conversationId ?? null,
    conversation: resolvedConversation
      ? {
          ...resolvedConversation,
          platform: messages[0]?.platform ?? session?.platform ?? null,
        }
      : undefined,
    items,
  };
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
  if (type === "RICH" && attachmentMeta && "cards" in attachmentMeta) {
    return attachmentMeta as any;
  }

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
    if (type === "INLINE_KEYBOARD") {
      const keyboard = (attachmentMeta as any)?.inlineKeyboard as
        | Array<Array<{ text: string; callbackData: string }>>
        | undefined;
      const inline_keyboard = keyboard?.map((row) =>
        row.map((btn) => ({ text: btn.text, callback_data: btn.callbackData }))
      );

      return await sendTelegramMessage(token, chatId, text, replyToMessageId, {
        inlineKeyboard: inline_keyboard,
      });
    }

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

router.get(
  "/sessions",
  requirePermission(["manageCampaigns", "viewReports"]),
  async (req: Request, res: Response) => {
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
  }
);

/* ------------------------------------------------------------------ */
/* GET /api/admin/chat/search                                         */
/* ------------------------------------------------------------------ */

router.get(
  "/search",
  requirePermission(["manageCampaigns", "viewReports"]),
  async (req: Request, res: Response): Promise<Response> => {
    const requestId = getRequestId(req);
    const log = createRequestLogger(requestId);
    try {
      const tenant = getTenant(req);
      const parsed = searchQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "invalid_query" });
      }

      const { q, limit = 100, platform, botId, userId } = parsed.data;

      const messages = await prisma.chatMessage.findMany({
        where: {
          tenant,
          ...(platform ? { platform } : {}),
          ...(botId ? { botId } : {}),
          ...(userId ? { session: { userId } } : {}),
          OR: [
            { text: { contains: q } },
            { attachmentMeta: { path: ["fileName"], string_contains: q } as any },
            { attachmentMeta: { path: ["mimeType"], string_contains: q } as any },
          ],
        },
        include: {
          session: {
            select: {
              id: true,
              platform: true,
              userId: true,
              displayName: true,
              botId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      log.info({ requestId, q, limit, count: messages.length }, "chat_search_ok");
      return res.json({ ok: true, items: messages });
    } catch (err: any) {
      log.error({ err, requestId }, "chat_search_error");
      return res.status(500).json({ ok: false, message: "internal_error_search" });
    }
  }
);

/* ------------------------------------------------------------------ */
/* GET /api/admin/chat/messages                                        */
/* ------------------------------------------------------------------ */

router.get(
  "/messages",
  requirePermission(["manageCampaigns", "viewReports"]),
  async (req: Request, res: Response): Promise<Response> => {
    const requestId = getRequestId(req);
    const log = createRequestLogger(requestId);
    try {
      const tenant = getTenant(req);
      const parsed = messagesQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "invalid_query" });
      }

      const { conversationId, sessionId, limit = 200, offset = 0 } = parsed.data;
      if (!conversationId && !sessionId) {
        return res
          .status(400)
          .json({ ok: false, message: "conversationId_or_sessionId_required" });
      }

      const result = await fetchAdminChatMessages(
        { tenant, conversationId, sessionId, limit, offset, requestId },
        prisma
      );

      log.info(
        `[Admin] chat/messages conversationId=${result.conversationId} count=${result.items.length}`
      );

      return res.json({ ok: true, ...result });
    } catch (err: any) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ ok: false, message: err.message });
      }
      log.error({ err, requestId }, "chat_messages_error");
      return res.status(500).json({ ok: false, message: "internal_error_list_messages" });
    }
  }
);

/* ------------------------------------------------------------------ */
/* GET /api/admin/chat/sessions/:id/messages                          */
/* ------------------------------------------------------------------ */

router.get(
  "/sessions/:id/messages",
  requirePermission(["manageCampaigns", "viewReports"]),
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
/* POST /api/admin/chat/rich-message                                  */
/* ------------------------------------------------------------------ */

router.post(
  "/rich-message",
  requirePermission(["manageCampaigns"]),
  async (req: Request, res: Response): Promise<Response> => {
    const requestId = getRequestId(req);
    const log = createRequestLogger(requestId);
    try {
      const tenant = getTenant(req);
      const parsed = richPayloadSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ ok: false, message: "invalid_payload" });
      }

      const payload = parsed.data;
      const session = await prisma.chatSession.findFirst({
        where: { id: payload.sessionId, tenant },
        include: { bot: { include: { secret: true } } },
      });

      if (!session?.bot) {
        return res
          .status(404)
          .json({ ok: false, message: "chat_session_not_found" });
      }

      if (payload.platform && payload.platform !== session.platform) {
        return res.status(400).json({ ok: false, message: "platform_mismatch" });
      }

      const bot = session.bot;
      const conversation = await ensureConversation({
        botId: bot.id,
        tenant: session.tenant,
        userId: session.userId,
        platform: session.platform,
        requestId,
      });

      const messageText = `${payload.title}\n${payload.body}`;
      let delivered = false;
      let messageType: MessageType = "RICH";
      let attachmentMeta: any = null;
      let attachmentUrl: string | null = payload.imageUrl ?? null;

      if (session.platform === "line") {
        const token = bot.secret?.channelAccessToken;
        if (!token) {
          return res.status(400).json({ ok: false, message: "line_token_missing" });
        }
        const flexPayload: FlexMessageInput = {
          altText: payload.altText || payload.title,
          cards: [
            {
              title: payload.title,
              body: payload.body,
              imageUrl: payload.imageUrl,
              buttons: (payload.buttons as FlexButton[] | undefined) ?? [],
            },
          ],
        };
        const flexMessage = buildFlexMessage(flexPayload);
        attachmentMeta = flexMessage;
        delivered = await sendLineRichMessage(
          token,
          session.userId,
          "RICH",
          messageText,
          attachmentUrl,
          flexMessage as any
        );
      } else if (session.platform === "telegram") {
        const token = bot.secret?.telegramBotToken;
        if (!token) {
          return res
            .status(400)
            .json({ ok: false, message: "telegram_token_missing" });
        }

        const inlineKeyboard = payload.inlineKeyboard?.map((row) =>
          row.map((btn) => ({ text: btn.text, callbackData: btn.callbackData }))
        );

        if (inlineKeyboard?.length) {
          messageType = "INLINE_KEYBOARD";
          attachmentMeta = { inlineKeyboard };
        } else {
          messageType = "RICH";
          attachmentMeta = {
            buttons: payload.buttons,
            imageUrl: payload.imageUrl,
          };
        }

        delivered = await sendTelegramRich(
          token,
          session.userId,
          messageType,
          messageText,
          payload.imageUrl,
          attachmentMeta ?? undefined
        );
      } else {
        return res.status(400).json({ ok: false, message: "unsupported_platform" });
      }

      recordDeliveryMetric(`${session.platform}:${bot.id}`, delivered, requestId);

      const msg = await prisma.chatMessage.create({
        data: {
          tenant: session.tenant,
          botId: session.botId,
          platform: session.platform,
          sessionId: session.id,
          conversationId: conversation.id,
          senderType: "admin",
          type: messageType,
          text: messageText,
          attachmentUrl: attachmentUrl,
          attachmentMeta,
          meta: { via: "admin_rich", delivered },
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

      try {
        sseHub.broadcast({
          type: "chat:message:new",
          tenant: session.tenant,
          botId: session.botId,
          sessionId: session.id,
          conversationId: conversation.id,
          message: {
            id: msg.id,
            senderType: "admin",
            text: msg.text,
            type: msg.type,
            attachmentUrl: msg.attachmentUrl,
            attachmentMeta: msg.attachmentMeta,
            createdAt: msg.createdAt,
          },
        } as any);
      } catch (broadcastErr) {
        log.warn("[admin rich message] SSE broadcast warn", broadcastErr);
      }

      await prisma.chatSession.update({
        where: { id: session.id },
        data: { lastMessageAt: new Date(), lastText: msg.text, lastDirection: "admin" },
      });

      return res.json({ ok: true, delivered, messageId: msg.id });
    } catch (err: any) {
      log.error({ err, requestId }, "admin_rich_message_error");
      return res.status(500).json({ ok: false, message: "internal_error_rich_message" });
    }
  }
);

/* ------------------------------------------------------------------ */
/* POST /api/admin/chat/sessions/:id/reply                            */
/* ------------------------------------------------------------------ */

router.post(
  "/sessions/:id/reply",
  requirePermission(["manageCampaigns"]),
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const requestId = getRequestId(req);
      const log = createRequestLogger(requestId);
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

      const conversation = await ensureConversation({
        botId: bot.id,
        tenant: session.tenant,
        userId: session.userId,
        platform: session.platform,
        requestId,
      });

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

      recordDeliveryMetric(`${platform}:${bot.id}`, delivered, requestId);
      log.info("[admin chat reply] delivery", {
        delivered,
        platform,
        botId: bot.id,
        sessionId: session.id,
        requestId,
      });

      // บันทึกข้อความฝั่ง admin ลง ChatMessage
      const now = new Date();
      const adminMsg = await prisma.chatMessage.create({
        data: {
          tenant: session.tenant,
          botId: session.botId,
          platform: session.platform,
          sessionId: session.id,
          conversationId: conversation.id,
          senderType: "admin",
          type: messageType,
          text: messageText || "",
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
          conversationId: conversation.id,
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
export { router as chatAdminRouter, fetchAdminChatMessages, HttpError };
