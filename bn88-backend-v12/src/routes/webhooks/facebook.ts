// src/routes/webhooks/facebook.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { config } from "../../config";
import { sendFacebookMessage } from "../../services/facebook";
import {
  processIncomingMessage,
  type SupportedPlatform,
} from "../../services/inbound/processIncomingMessage";
import { MessageType } from "@prisma/client";
import { createRequestLogger, getRequestId } from "../../utils/logger";

const router = Router();

/* ----------------------------- Facebook Types ---------------------------- */

type FbMessaging = {
  sender: { id: string }; // PSID (user)
  recipient: { id: string }; // page id
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: any[];
  };
  [key: string]: unknown;
};

type FbEntry = {
  id: string;
  time: number;
  messaging?: FbMessaging[];
};

type FbWebhookPayload = {
  object: string;
  entry?: FbEntry[];
};

type FbAttachment = {
  type?: string;
  payload?: {
    url?: string;
    sticker_url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function mapFacebookMessage(msg?: FbMessaging["message"]) {
  if (!msg) return null;

  const baseMeta = { mid: msg.mid } as Record<string, unknown>;

  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    const first = msg.attachments[0] as FbAttachment;
    const attType = (first.type || "").toLowerCase();
    const url =
      (first.payload?.url as string | undefined) ||
      (first.payload?.sticker_url as string | undefined) ||
      undefined;

    const meta = { ...baseMeta, attachment: first };

    if (attType === "image") {
      return {
        text: msg.text ?? "",
        messageType: "IMAGE" as MessageType,
        attachmentUrl: url,
        attachmentMeta: meta,
      };
    }

    if (attType === "file" || attType === "video" || attType === "audio") {
      return {
        text: msg.text ?? "",
        messageType: "FILE" as MessageType,
        attachmentUrl: url,
        attachmentMeta: meta,
      };
    }

    if (attType === "sticker") {
      return {
        text: msg.text ?? "",
        messageType: "STICKER" as MessageType,
        attachmentUrl: url,
        attachmentMeta: meta,
      };
    }
  }

  return {
    text: msg.text ?? "",
    messageType: "TEXT" as MessageType,
    attachmentUrl: undefined,
    attachmentMeta: baseMeta,
  };
}

/* -------------------------- Resolve Facebook Bot ------------------------ */

async function resolveBot(tenant: string, botIdParam?: string) {
  let bot: { id: string } | null = null;

  // 1) ถ้ามี botId ใน query → ใช้อันนั้นก่อน
  if (botIdParam) {
    bot = await prisma.bot.findFirst({
      where: { id: botIdParam, tenant, platform: "facebook" },
      select: { id: true },
    });
  }

  // 2) ถ้าไม่เจอ → fallback เป็นตัวแรกที่ active / ตัวแรกของ platform นี้
  if (!bot) {
    bot =
      (await prisma.bot.findFirst({
        where: { tenant, platform: "facebook", active: true },
        select: { id: true },
      })) ??
      (await prisma.bot.findFirst({
        where: { tenant, platform: "facebook" },
        select: { id: true },
      }));
  }

  if (!bot?.id) return null;

  const sec = await prisma.botSecret.findFirst({
    where: { botId: bot.id },
    select: {
      channelAccessToken: true, // ✅ ใช้ field เดิม
      openaiApiKey: true,
    },
  });

  const cfg = await prisma.botConfig.findFirst({
    where: { botId: bot.id },
    select: {
      systemPrompt: true,
      model: true,
      temperature: true,
      topP: true,
      maxTokens: true,
    },
  });

  return {
    botId: bot.id,
    pageAccessToken: sec?.channelAccessToken || "", // ✅ map เป็น pageAccessToken
    openaiApiKey: sec?.openaiApiKey ?? "",
    systemPrompt: cfg?.systemPrompt ?? "",
    model: cfg?.model ?? (process.env.OPENAI_MODEL || "gpt-4o-mini"),
    temperature: cfg?.temperature ?? 0.3,
    topP: cfg?.topP ?? 0.9,
    maxTokens: cfg?.maxTokens ?? 600,
  };
}

/* ---------------------------- Webhook Verify ----------------------------- */

// GET /api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
router.get("/", async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyTokenEnv = process.env.FACEBOOK_VERIFY_TOKEN || "";

  if (mode === "subscribe" && token === verifyTokenEnv && typeof challenge === "string") {
    console.log("[FACEBOOK] Webhook verified");
    return res.status(200).send(challenge);
  }

  console.warn("[FACEBOOK] Webhook verify failed", { mode, token });
  return res.status(403).send("Forbidden");
});

/* ------------------------------ Webhook POST ----------------------------- */

router.post("/", async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const log = createRequestLogger(requestId);
  try {
    const tenant =
      (req.headers["x-tenant"] as string) || config.TENANT_DEFAULT || "bn9";
    const botIdParam =
      typeof req.query.botId === "string" ? req.query.botId : undefined;

    const resolved = await resolveBot(tenant, botIdParam);
    if (!resolved) {
      return res
        .status(400)
        .json({ ok: false, message: "facebook_bot_not_configured" });
    }

    const { botId, pageAccessToken } = resolved;

    const body = req.body as FbWebhookPayload;

    if (body.object !== "page" || !Array.isArray(body.entry)) {
      return res
        .status(200)
        .json({ ok: true, skipped: true, reason: "not_page_event" });
    }

    const platform: SupportedPlatform = "facebook";
    const results: Array<Record<string, unknown>> = [];

    for (const entry of body.entry) {
      const list = entry.messaging ?? [];
      for (const ev of list) {
        const msg = ev.message;
        if (!msg) {
          results.push({ skipped: true, reason: "no_message" });
          continue;
        }

        const mapped = mapFacebookMessage(msg);
        if (!mapped) {
          results.push({ skipped: true, reason: "unsupported_message" });
          continue;
        }

        const userId = ev.sender?.id || "unknown";
        const platformMessageId = msg.mid || undefined;

        const { reply, intent, isIssue } = await processIncomingMessage({
          botId,
          platform,
          userId,
          text: mapped.text ?? "",
          messageType: mapped.messageType,
          attachmentUrl: mapped.attachmentUrl ?? undefined,
          attachmentMeta: mapped.attachmentMeta,
          displayName: userId,
          platformMessageId,
          rawPayload: ev,
          requestId,
        });

        let replied = false;
        if (reply && pageAccessToken) {
          try {
            replied = await sendFacebookMessage(pageAccessToken, userId, reply);
          } catch (err) {
            log.error("[FACEBOOK sendMessage error]", err);
          }
        }

        results.push({ ok: true, replied, intent, isIssue });
      }
    }

    return res.status(200).json({ ok: true, results, requestId });
  } catch (e) {
    log.error("[FACEBOOK WEBHOOK ERROR]", e);
    return res
      .status(500)
      .json({ ok: false, message: "internal_error", requestId });
  }
});

export default router;
export { router as facebookWebhookRouter };
