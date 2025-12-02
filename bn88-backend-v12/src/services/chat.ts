// src/services/chat.ts
import { prisma } from "../lib/prisma";
import { MessageType } from "@prisma/client";
import { ensureConversation } from "./conversation";

export type PlatformType = "line" | "telegram" | "facebook" | "web";

type UpsertChatOptions = {
  tenant: string;
  botId: string;
  platform: PlatformType | string;
  userId: string;
  displayName?: string | null;

  userText?: string | null; // ข้อความฝั่งลูกค้า
  botText?: string | null;  // ข้อความฝั่งบอทตอบกลับ
  metaUser?: unknown;
  metaBot?: unknown;
};

/**
 * ใช้ใน webhook:
 * - สร้าง/อัปเดต ChatSession
 * - เพิ่ม ChatMessage ฝั่ง user / bot ตามที่ส่งมา
 */
export async function upsertChatSessionAndMessages(opts: UpsertChatOptions) {
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
  let conversationId: string;

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

  const conversation = await ensureConversation({
    botId,
    tenant,
    userId,
    platform,
  });
  conversationId = conversation.id;

  const messagesData: {
    tenant: string;
    sessionId: string;
    botId: string;
    platform: string;
    userId: string;
    conversationId: string;
    senderType: string;
    type: MessageType;
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
      conversationId,
      senderType: "user",
      type: "TEXT",
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
      conversationId,
      senderType: "bot",
      type: "TEXT",
      text: botText.trim(),
      meta: metaBot ?? undefined,
    });
  }

  if (messagesData.length > 0) {
    await prisma.chatMessage.createMany({ data: messagesData });
  }

  return { sessionId };
}
