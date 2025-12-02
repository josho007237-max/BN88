// src/routes/webhooks/facebook.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { config } from "../../config";
import { askPloy } from "../../services/ai";
import { defaultSystemPrompt } from "../../services/prompt";
import { sendFacebookMessage } from "../../services/facebook";

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

/* ------------------------------ Classifier ------------------------------ */

function classify(t0: string) {
  const t = (t0 || "").toLowerCase();

  if (
    ["ฝากไม่เข้า", "เครดิตไม่เข้า", "เติมไม่เข้า", "ฝากเงิน", "เติมเงิน", "ฝาก"].some(
      (k) => t.includes(k)
    )
  )
    return "deposit" as const;

  if (
    ["ถอนไม่ได้", "ถอนเงิน", "ถอนช้า", "ถอนไม่ออก", "ถอน"].some((k) =>
      t.includes(k)
    )
  )
    return "withdraw" as const;

  if (["ยืนยันตัวตน", "เอกสาร", "บัตรประชาชน", "kyc"].some((k) => t.includes(k)))
    return "kyc" as const;

  if (
    ["สมัครสมาชิก", "สมัคร", "เปิดยูส", "เปิด user", "เปิดยูสเซอร์"].some((k) =>
      t.includes(k)
    )
  )
    return "register" as const;

  return "other" as const;
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

    const {
      botId,
      pageAccessToken,
      openaiApiKey,
      systemPrompt,
      model,
      temperature,
      topP,
      maxTokens,
    } = resolved;

    const body = req.body as FbWebhookPayload;

    if (body.object !== "page" || !Array.isArray(body.entry)) {
      return res
        .status(200)
        .json({ ok: true, skipped: true, reason: "not_page_event" });
    }

    let handled = false;

    for (const entry of body.entry) {
      const list = entry.messaging ?? [];
      for (const ev of list) {
        // โฟกัสเฉพาะ message ที่เป็น text
        const msg = ev.message;
        if (!msg || typeof msg.text !== "string") continue;

        handled = true;

        const psid = ev.sender.id; // user id
        const text = msg.text;
        const kind = classify(text);

        // 1) บันทึกเคส
        const createdCase = await prisma.caseItem.create({
          data: {
            tenant,
            botId,
            platform: "facebook",
            userId: psid,
            text,
            kind,
            meta: {
              entryId: entry.id,
              rawEvent: ev,
            } as any,
          },
          select: { id: true },
        });

        // 2) อัปเดต StatDaily
        const dateKey = new Date().toISOString().slice(0, 10);
        try {
          await prisma.statDaily.upsert({
            where: { botId_dateKey: { botId, dateKey } },
            update: {
              total: { increment: 1 },
              text: { increment: 1 },
            },
            create: {
              tenant,
              botId,
              dateKey,
              total: 1,
              text: 1,
              follow: 0,
              unfollow: 0,
            },
          });
        } catch (err) {
          console.error("[FACEBOOK statDaily upsert error]", err);
        }

        // 3) เตรียมข้อความตอบกลับ (AI ก่อน, ถ้าไม่มีค่อย fallback)
        let answer = "";

        if (openaiApiKey) {
          try {
            answer = await askPloy({
              openaiKey: openaiApiKey,
              model,
              systemPrompt: systemPrompt || defaultSystemPrompt,
              userText: text,
              temperature,
              top_p: topP,
              max_tokens: maxTokens,
            });
          } catch (aiErr) {
            console.error("[FACEBOOK AI error]", aiErr);
          }
        }

        // fallback ถ้าไม่มี AI หรือตอบ AI ล้มเหลว
        if (!answer) {
          if (kind === "deposit") {
            answer = "รับเรื่องฝากไม่เข้าแล้วครับ กำลังตรวจสอบให้นะครับ 🙏";
          } else if (kind === "withdraw") {
            answer = "รับเรื่องถอนแล้วครับ กำลังตรวจสอบให้นะครับ 🙏";
          } else if (kind === "kyc") {
            answer = "รับเรื่องยืนยันตัวตนแล้วครับ กำลังตรวจสอบให้นะครับ 🙏";
          } else if (kind === "register") {
            answer = "รับเรื่องสมัครสมาชิกแล้วครับ เดี๋ยวแอดมินตรวจสอบให้นะครับ 🙏";
          } else {
            answer = "รับข้อความแล้วครับ แอดมินกำลังตรวจสอบให้นะครับ 🙏";
          }
        }

        // 4) ส่งข้อความกลับไปที่ Facebook
        if (answer && pageAccessToken) {
          try {
            await sendFacebookMessage(pageAccessToken, psid, answer);
          } catch (sendErr) {
            console.error("[FACEBOOK sendMessage error]", sendErr);
          }
        }

        console.log("[FACEBOOK] handled message", {
          caseId: createdCase.id,
          psid,
          kind,
        });
      }
    }

    return res.status(200).json({ ok: true, handled });
  } catch (e) {
    console.error("[FACEBOOK WEBHOOK ERROR]", e);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

export default router;
