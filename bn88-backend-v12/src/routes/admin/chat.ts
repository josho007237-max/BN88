// src/routes/admin/chat.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { config } from "../../config";
import { sseHub } from "../../lib/sseHub";
import { sendTelegramMessage } from "../../services/telegram";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const router = Router();
const TENANT_DEFAULT = process.env.TENANT_DEFAULT || "bn9";

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

/* ------------------------------------------------------------------ */
/* GET /api/admin/chat/sessions                                       */
/* ------------------------------------------------------------------ */
/**
 * Query:
 *  - botId?: string
 *  - platform?: string ("line" | "telegram" | ... )
 *  - limit?: number (default 50)
 */
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
      const { text } = req.body as { text?: string };

      if (!text || typeof text !== "string" || !text.trim()) {
        return res
          .status(400)
          .json({ ok: false, message: "text_required_for_reply" });
      }

      const messageText = text.trim();

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
            delivered = await sendTelegramMessage(
              token,
              session.userId,
              messageText
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
            delivered = await sendLinePushMessage(
              token,
              session.userId,
              messageText
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
          messageType: "text",
          text: messageText,
          meta: {
            via: "admin_reply",
            delivered,
          } as any,
        },
        select: {
          id: true,
          text: true,
          createdAt: true,
        },
      });

      // อัปเดต session
      await prisma.chatSession.update({
        where: { id: session.id },
        data: {
          lastMessageAt: now,
          lastText: messageText,
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
/* PATCH /api/admin/chat/sessions/:id/meta                            */
/* ใช้สำหรับอัพเดต status + tags ของ session                         */
/* ------------------------------------------------------------------ */

const updateSessionMetaSchema = z.object({
  status: z.enum(["open", "pending", "closed"]).optional(),
  tags: z.array(z.string().min(1).max(50)).optional(),
});

router.patch(
  "/sessions/:id/meta",
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const tenant = getTenant(req);
      const sessionId = String(req.params.id);

      const parseResult = updateSessionMetaSchema.safeParse(req.body ?? {});
      if (!parseResult.success) {
        return res.status(400).json({
          ok: false,
          message: "invalid_input",
          issues: parseResult.error.issues,
        });
      }

      const data = parseResult.data;

      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, tenant },
      });

      if (!session) {
        return res
          .status(404)
          .json({ ok: false, message: "chat_session_not_found" });
      }

      const updateData: Prisma.ChatSessionUpdateInput = {};

      if (data.status) {
        updateData.status = data.status;
      }

      if (data.tags) {
        updateData.tags = data.tags;
      }

      const updated = await prisma.chatSession.update({
        where: { id: session.id },
        data: updateData,
      });

      // broadcast event ให้ Dashboard/ChatCenter
      try {
        sseHub.broadcast({
          type: "chat:session:meta_updated",
          tenant: updated.tenant,
          botId: updated.botId,
          sessionId: updated.id,
          status: updated.status,
          tags: updated.tags,
        } as any);
      } catch (err) {
        console.warn("[admin chat meta] SSE broadcast warn", err);
      }

      return res.json({ ok: true, session: updated });
    } catch (err) {
      console.error("[admin chat meta] fatal error", err);
      return res
        .status(500)
        .json({ ok: false, message: "internal_error_update_meta" });
    }
  }
);

/* ------------------------------------------------------------------ */

export default router;
export { router as chatAdminRouter };
