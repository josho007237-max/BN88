// src/services/chat.ts
import { prisma } from "../lib/prisma";
import { sendLinePushMessage } from "./line";

export type PlatformType = "line" | "telegram" | "facebook" | "web";

type UpsertChatOptions = {
  tenant: string;
  botId: string;
  platform: PlatformType | string;
  userId: string;
  displayName?: string | null;

  userText?: string | null; // ข้อความฝั่งลูกค้า
  botText?: string | null;  // ข้อความฝั่งบอทตอบกลับ (auto-reply)
  metaUser?: unknown;
  metaBot?: unknown;
};

/**
 * ใช้ใน webhook (เวอร์ชัน generic):
 * - สร้าง/อัปเดต ChatSession
 * - เพิ่ม ChatMessage ฝั่ง user / bot ตามที่ส่งมา
 */
export async function upsertChatSessionAndMessages(
  opts: UpsertChatOptions
) {
  const {
    tenant,
    botId,
    platform,
    userId,
    displayName,
    userText,
    botText,
    metaUser,
    metaBot,
  } = opts;

  // 1) หา session เดิม
  const existing = await prisma.chatSession.findFirst({
    where: { tenant, botId, platform, userId },
  });

  let sessionId: string;

  if (existing) {
    // อัปเดต lastMessageAt + displayName ถ้ามี
    const updated = await prisma.chatSession.update({
      where: { id: existing.id },
      data: {
        lastMessageAt: new Date(),
        ...(displayName ? { displayName } : {}),
      },
    });
    sessionId = updated.id;
  } else {
    // ยังไม่มี → สร้างใหม่
    const created = await prisma.chatSession.create({
      data: {
        tenant,
        botId,
        platform,
        userId,
        displayName: displayName || undefined,
        lastMessageAt: new Date(),
      },
    });
    sessionId = created.id;
  }

  const messagesData: {
    tenant: string;
    sessionId: string;
    botId: string;
    platform: string;
    userId: string;
    senderType: string;
    messageType: string;
    text: string;
    meta?: any;
  }[] = [];

  if (userText && userText.trim()) {
    messagesData.push({
      tenant,
      sessionId,
      botId,
      platform,
      userId,
      senderType: "user",
      messageType: "text",
      text: userText.trim(),
      meta: metaUser ?? undefined,
    });
  }

  if (botText && botText.trim()) {
    messagesData.push({
      tenant,
      sessionId,
      botId,
      platform,
      userId,
      senderType: "bot",
      messageType: "text",
      text: botText.trim(),
      meta: metaBot ?? undefined,
    });
  }

  if (messagesData.length > 0) {
    await prisma.chatMessage.createMany({ data: messagesData });
  }

  return { sessionId };
}

/**
 * ใช้ตอนแอดมินตอบจาก Chat Center:
 * - สร้าง ChatMessage ฝั่งบอท/แอดมิน ใน session ที่เลือก
 * - ถ้าเป็น LINE และมี channelAccessToken → ส่ง push ออกไปหาลูกค้าด้วย
 */
export async function sendAdminReplyToUser(opts: {
  sessionId: string;
  text: string;
  metaBot?: unknown;
}) {
  const { sessionId, text, metaBot } = opts;
  const trimmed = text.trim();

  if (!trimmed) {
    return;
  }

  // โหลด session + bot + secret
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      bot: {
        include: {
          secret: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error("CHAT_SESSION_NOT_FOUND");
  }

  const { tenant, botId, platform, userId, bot } = session;

  // 1) บันทึกข้อความฝั่งบอท/แอดมินใน ChatMessage
  const message = await prisma.chatMessage.create({
    data: {
      tenant,
      sessionId: session.id,
      botId,
      platform,
      senderType: "bot", // ถ้าต้องการแยกเป็น 'admin' ค่อยเปลี่ยนภายหลัง
      messageType: "text",
      text: trimmed,
      meta: metaBot ?? undefined,
    },
  });

  // 2) ถ้า platform = LINE → ยิง push ออกไป
  if (platform === "line") {
    // ✅ ใช้ชื่อ field ที่ตรงกับ Prisma model: channelAccessToken
    const channelAccessToken = (bot as any)?.secret
      ?.channelAccessToken as string | undefined;

    if (channelAccessToken) {
      try {
        await sendLinePushMessage({
          channelAccessToken,
          to: userId, // userId ของ LINE ใน session นี้
          text: trimmed,
        });
      } catch (err: any) {
        console.warn(
          "[LINE push warning]",
          err?.response?.data || err?.message || String(err)
        );
      }
    } else {
      console.warn(
        "[LINE push skipped] missing channelAccessToken in bot.secret",
        { botId }
      );
    }
  }

  return message;
}
