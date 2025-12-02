// src/services/line.ts
// ใช้ global fetch ของ Node 18+/20+ ได้เลย ไม่ต้องติดตั้ง node-fetch เพิ่ม

// -----------------------------------------------------------------------------
// 1. LINE Reply (ใช้ replyToken) 
// -----------------------------------------------------------------------------

export type LineReplyPayload = {
  channelAccessToken: string; // LINE channel access token ของบอท
  replyToken: string;         // replyToken จาก webhook
  text: string;               // ข้อความที่ต้องการส่งตอบ
};

/**
 * ส่งข้อความแบบ reply กลับไปหา LINE (ใช้ใน webhook ทันที)
 * - เหมาะกับการตอบกลับภายใน ~1 วินาทีหลังได้รับ event
 * - ถ้า replyToken หมดอายุ / ใช้ซ้ำ / ไม่ตรงบอท → LINE จะตอบ 400
 */
export async function replyMessage(
  { channelAccessToken, replyToken, text }: LineReplyPayload
): Promise<void> {
  const url = 'https://api.line.me/v2/bot/message/reply';

  const body = {
    replyToken,
    messages: [
      {
        type: 'text' as const,
        text,
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[LINE reply] error', res.status, t);
    throw new Error(`LINE_REPLY_FAILED_${res.status}`);
  }
}

// -----------------------------------------------------------------------------
// 2. LINE Push (ใช้ userId, ไม่มี replyToken)
// -----------------------------------------------------------------------------

export type LinePushPayload = {
  channelAccessToken: string; // LINE channel access token ของบอท
  to: string;                 // userId จาก LINE (เช่น Uxxxxxxxxx)
  text: string;               // ข้อความที่ต้องการส่ง
};

/**
 * ส่งข้อความแบบ push ไปหา user ทาง LINE
 * - ใช้ตอนแอดมินตอบจากหลังบ้าน (ไม่มี replyToken แล้ว)
 * - หรือใช้เป็น fallback ถ้า replyToken ใช้ไม่ได้
 */
export async function sendLinePushMessage(
  { channelAccessToken, to, text }: LinePushPayload
): Promise<void> {
  const url = 'https://api.line.me/v2/bot/message/push';

  const body = {
    to,
    messages: [
      {
        type: 'text' as const,
        text,
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[LINE push] error', res.status, t);
    throw new Error(`LINE_PUSH_FAILED_${res.status}`);
  }
}
