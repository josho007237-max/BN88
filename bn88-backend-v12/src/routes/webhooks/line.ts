// src/routes/webhooks/line.ts

import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { MessageType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { config } from "../../config";
import {
  processIncomingMessage,
  type SupportedPlatform,
} from "../../services/inbound/processIncomingMessage";
import { createRequestLogger, getRequestId } from "../../utils/logger";

const router = Router();
const TENANT_DEFAULT = process.env.TENANT_DEFAULT || "bn9";

/* ------------------------------------------------------------------ */
/* Utilities                                                          */
/* ------------------------------------------------------------------ */

function getRawBody(req: Request): Buffer | null {
  const b: unknown = (req as any).body;
  if (Buffer.isBuffer(b)) return b;
  if (typeof b === "string") return Buffer.from(b);
  // กรณีใช้ express.raw() มักจะได้ Buffer อยู่แล้ว
  return null;
}

/** Verify LINE signature (ข้ามได้เมื่อ LINE_DEV_SKIP_VERIFY=1) */
function verifyLineSignature(req: Request, channelSecret?: string): boolean {
  if (config.LINE_DEV_SKIP_VERIFY === "1") return true;

  const secret = channelSecret || config.LINE_CHANNEL_SECRET;
  const sig = req.headers["x-line-signature"];
  const raw = getRawBody(req);

  if (!secret || !sig || !raw) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("base64");

  return expected === sig;
}

/* ------------------------------------------------------------------ */
/* LINE Types                                                         */
/* ------------------------------------------------------------------ */

type LineSource = {
  type: "user" | "group" | "room";
  userId?: string;
  groupId?: string;
  roomId?: string;
};

type LineMessage = {
  id?: string;
  type: string;
  text?: string;
  fileName?: string;
  fileSize?: number;
  packageId?: string;
  stickerId?: string;
  title?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

type LineEvent = {
  type: "message" | string;
  replyToken?: string;
  timestamp: number;
  source?: LineSource;
  message?: LineMessage;
};

type LineWebhookBody = {
  events?: LineEvent[];
};

const LINE_CONTENT_BASE = "https://api-data.line.me/v2/bot/message";

export type NormalizedLineMessage = {
  text: string;
  messageType: MessageType;
  attachmentUrl?: string | null;
  attachmentMeta?: Record<string, unknown> | null;
};

export function mapLineMessage(m?: LineMessage): NormalizedLineMessage | null {
  if (!m || typeof m !== "object") return null;

  const baseMeta = {
    lineType: m.type,
    messageId: m.id,
    fileName: m.fileName,
    fileSize: m.fileSize,
    packageId: m.packageId,
    stickerId: m.stickerId,
  } as Record<string, unknown>;

  if (m.type === "text") {
    return {
      text: m.text ?? "",
      messageType: MessageType.TEXT,
      attachmentUrl: null,
      attachmentMeta: baseMeta,
    };
  }

  if (m.type === "image") {
    return {
      text: m.text ?? "",
      messageType: MessageType.IMAGE,
      attachmentUrl: m.id ? `${LINE_CONTENT_BASE}/${m.id}/content` : null,
      attachmentMeta: baseMeta,
    };
  }

  if (m.type === "file") {
    return {
      text: m.text ?? m.fileName ?? "",
      messageType: MessageType.FILE,
      attachmentUrl: m.id ? `${LINE_CONTENT_BASE}/${m.id}/content` : null,
      attachmentMeta: baseMeta,
    };
  }

  if (m.type === "sticker") {
    return {
      text: m.text ?? "",
      messageType: MessageType.STICKER,
      attachmentUrl: null,
      attachmentMeta: baseMeta,
    };
  }

  if (m.type === "location") {
    const lat = m.latitude;
    const lng = m.longitude;
    const locUrl =
      typeof lat === "number" && typeof lng === "number"
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : null;

    return {
      text: m.address ?? m.title ?? "location",
      messageType: MessageType.SYSTEM,
      attachmentUrl: locUrl,
      attachmentMeta: {
        ...baseMeta,
        address: m.address,
        title: m.title,
        latitude: lat,
        longitude: lng,
      },
    };
  }

  return {
    text: m.text ?? "",
    messageType: MessageType.TEXT,
    attachmentUrl: null,
    attachmentMeta: baseMeta,
  };
}

/* ------------------------------------------------------------------ */
/* Bot resolver (หา bot + secrets สำหรับ LINE)                       */
/* ------------------------------------------------------------------ */

async function resolveBot(tenant: string, botIdParam?: string) {
  // หา bot ตาม botId -> ไม่เจอค่อย fallback เป็น active line bot ตัวแรกของ tenant
  let bot: { id: string; tenant: string; platform: string } | null = null;

  if (botIdParam) {
    bot = await prisma.bot.findFirst({
      where: { id: botIdParam, tenant, platform: "line" },
      select: { id: true, tenant: true, platform: true },
    });
  }

  if (!bot) {
    bot =
      (await prisma.bot.findFirst({
        where: { tenant, platform: "line", active: true },
        select: { id: true, tenant: true, platform: true },
      })) ??
      (await prisma.bot.findFirst({
        where: { tenant, platform: "line" },
        select: { id: true, tenant: true, platform: true },
      }));
  }

  if (!bot?.id) return null;

  const sec = await prisma.botSecret.findFirst({
    where: { botId: bot.id },
    select: {
      channelSecret: true,
      channelAccessToken: true,
    },
  });

  return {
    botId: bot.id,
    tenant: bot.tenant ?? tenant,
    channelSecret: sec?.channelSecret ?? "",
    channelAccessToken: sec?.channelAccessToken ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* LINE reply helper                                                  */
/* ------------------------------------------------------------------ */

async function lineReply(
  replyToken: string,
  channelAccessToken: string,
  text: string
): Promise<boolean> {
  const f = (globalThis as any).fetch as typeof fetch | undefined;
  if (!f) {
    console.error("[LINE reply error] global fetch is not available");
    return false;
  }

  const resp = await f("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.warn("[LINE reply warning]", resp.status, t);
    return false;
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* POST /api/webhooks/line?botId=...                                  */
/* ------------------------------------------------------------------ */

router.post("/", async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const log = createRequestLogger(requestId);
  try {
    // 1) resolve tenant & bot
    const tenantHeader =
      (req.headers["x-tenant"] as string) ||
      config.TENANT_DEFAULT ||
      TENANT_DEFAULT;

    const botIdParam =
      typeof req.query.botId === "string" ? (req.query.botId as string) : undefined;

    const picked = await resolveBot(tenantHeader, botIdParam);
    if (!picked) {
      log.error("[LINE webhook] bot not configured for tenant", tenantHeader);
      return res
        .status(400)
        .json({ ok: false, message: "line_bot_not_configured" });
    }

    const { botId, tenant, channelSecret, channelAccessToken } = picked;

    // 2) verify signature
    if (!verifyLineSignature(req, channelSecret)) {
      log.warn("[LINE webhook] invalid signature");
      return res.status(401).json({ ok: false, message: "invalid_signature" });
    }

    // 3) parse body (รองรับทั้ง Buffer และ object)
    let payload: LineWebhookBody | null = (req as any).body;
    const maybeBuffer: any = payload as any;
    if ((Buffer as any).isBuffer?.(maybeBuffer)) {
      try {
        payload = JSON.parse(maybeBuffer.toString("utf8"));
      } catch {
        payload = null;
      }
    }

    const events: LineEvent[] = Array.isArray(payload?.events)
      ? payload!.events!
      : [];

    // กรณี Verify / ping → events ว่าง ให้ตอบ 200 ทันที
    if (!events.length) {
      return res.status(200).json({ ok: true, noEvents: true });
    }

    const isRetry = Boolean(req.headers["x-line-retry-key"]);
    const platform: SupportedPlatform = "line";
    const results: Array<Record<string, unknown>> = [];

    // 4) loop events
    for (const ev of events) {
      try {
        if (ev.type !== "message" || !ev.message) {
          results.push({ skipped: true, reason: "not_message" });
          continue;
        }

        const mapped = mapLineMessage(ev.message as LineMessage);
        if (!mapped) {
          results.push({ skipped: true, reason: "unsupported_message" });
          continue;
        }

        const userId =
          ev.source?.userId ||
          ev.source?.groupId ||
          ev.source?.roomId ||
          "unknown";

        const text = mapped.text || "";

        // ตอนนี้ยังไม่ได้ดึง profile จาก LINE จึงใช้ userId/groupId/roomId แทน displayName ไปก่อน
        const displayName =
          ev.source?.userId ||
          ev.source?.groupId ||
          ev.source?.roomId ||
          undefined;

        const platformMessageId = (ev.message as LineMessage).id ?? undefined;

        // 5) ให้ pipeline กลางจัดการทั้งหมด (chat/case/stat/AI)
        const { reply, intent, isIssue } = await processIncomingMessage({
          botId,
          platform,
          userId,
          text,
          messageType: mapped.messageType,
          attachmentUrl: mapped.attachmentUrl ?? undefined,
          attachmentMeta: mapped.attachmentMeta ?? undefined,
          displayName,
          platformMessageId,
          rawPayload: ev,
          requestId,
        });

        let replySent = false;

        // 6) ส่งตอบกลับ LINE (ยกเว้นกรณี retry)
        if (!isRetry && ev.replyToken && channelAccessToken && reply) {
          try {
            replySent = await lineReply(
              ev.replyToken,
              channelAccessToken,
              reply
            ).catch(() => false);
          } catch (err) {
            log.error("[LINE reply error]", err);
            replySent = false;
          }
        }

        results.push({
          ok: true,
          replied: replySent,
          intent,
          isIssue,
        });
      } catch (evErr) {
        log.error("[LINE webhook event error]", evErr);
        results.push({ ok: false, error: true });
      }
    }

    // 7) ตอบกลับ LINE ว่าสำเร็จ (สำคัญมากเพื่อไม่ให้ retry ถี่)
    return res.status(200).json({
      ok: true,
      results,
      retry: isRetry,
      tenant,
      requestId,
    });
  } catch (e) {
    log.error("[LINE WEBHOOK ERROR]", e);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

export default router;
export { router as lineWebhookRouter };
