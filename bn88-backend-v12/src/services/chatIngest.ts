// src/services/chatIngest.ts
import { prisma } from "../lib/prisma";

/**
 * ผลลัพธ์มาตรฐานของการ ingest ข้อความ
 */
export type IngestTextResult = {
  ok: boolean;
  sessionId?: string;
  messageId?: string;
  error?: string;
};

type PlatformType = "line" | "telegram" | "facebook" | "web" | "webchat" | string;

/**
 * พารามิเตอร์พื้นฐานของข้อความแชท
 */
type BaseIngestOptions = {
  tenant: string;
  botId: string;
  platform: PlatformType;
  userId: string;
  text: string;
  kind?: string | null;
  caseId?: string | null;
  displayName?: string | null;
  platformMessageId?: string | null;
  // rawEvent?: unknown;   // ถ้าจะเก็บ event ดิบค่อยเปิดใช้ทีหลัง
};

/**
 * ฟังก์ชันภายในใช้ร่วมกัน ทั้ง user / bot / admin
 */
async function ingestInternal(
  opts: BaseIngestOptions & { senderType: "user" | "bot" | "admin" }
): Promise<IngestTextResult> {
  try {
    const now = new Date();

    // 1) upsert ChatSession (อิง key = botId + userId)
    const session = await prisma.chatSession.upsert({
      where: {
        botId_userId: {
          botId: opts.botId,
          userId: opts.userId,
        },
      },
      update: {
        lastMessageAt: now,
        lastText: opts.text,
        lastDirection: opts.senderType,
        ...(opts.displayName
          ? { displayName: opts.displayName }
          : {}),
      },
      create: {
        tenant: opts.tenant,
        botId: opts.botId,
        platform: opts.platform,
        userId: opts.userId,
        displayName: opts.displayName ?? opts.userId,
        firstMessageAt: now,
        lastMessageAt: now,
        lastText: opts.text,
        lastDirection: opts.senderType,
      },
    });

    // 2) สร้าง ChatMessage (ต้องใส่ botId + platform ให้ครบตาม schema)
    const msg = await prisma.chatMessage.create({
      data: {
        tenant: opts.tenant,
        botId: opts.botId,
        platform: opts.platform,
        sessionId: session.id,
        senderType: opts.senderType,
        messageType: "text",
        text: opts.text,
        platformMessageId: opts.platformMessageId ?? null,
        // meta เป็น JSON → เก็บเฉพาะข้อมูลที่แน่ใจว่าเป็น JSON ได้
        meta: {
          platform: opts.platform,
          kind: opts.kind ?? null,
          caseId: opts.caseId ?? null,
        },
      },
    });

    return {
      ok: true,
      sessionId: session.id,
      messageId: msg.id,
    };
  } catch (err) {
    console.error("[chatIngest] ingestInternal error:", err);
    return {
      ok: false,
      error: "INGEST_TEXT_ERROR",
    };
  }
}

/**
 * ใช้บันทึกข้อความจาก “ลูกค้า”
 */
export function ingestUserText(
  opts: BaseIngestOptions
): Promise<IngestTextResult> {
  return ingestInternal({ ...opts, senderType: "user" });
}

/**
 * ใช้บันทึกข้อความ “บอทตอบ”
 */
export function ingestBotText(
  opts: BaseIngestOptions
): Promise<IngestTextResult> {
  return ingestInternal({ ...opts, senderType: "bot" });
}

/**
 * ใช้บันทึกข้อความ “แอดมินตอบ” (จาก Chat Center)
 */
export function ingestAdminText(
  opts: BaseIngestOptions
): Promise<IngestTextResult> {
  return ingestInternal({ ...opts, senderType: "admin" });
}
