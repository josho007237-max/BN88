import assert from "node:assert/strict";
import { MessageType } from "@prisma/client";

process.env.SECRET_ENC_KEY_BN9 ||= "12345678901234567890123456789012";
process.env.JWT_SECRET ||= "test-jwt";
process.env.ENABLE_ADMIN_API ||= "1";
process.env.DATABASE_URL ||= "file:./dev.db";

type TgMsg = {
  message_id: number;
  date: number;
  chat: { id: number | string; type: string };
  text?: string;
  photo?: Array<{ file_id: string; width?: number; height?: number }>;
  document?: { file_id: string; file_name?: string };
};

async function run() {
  const { mapTelegramMessage } = await import("../../src/routes/webhooks/telegram");

  const baseMsg: TgMsg = {
    message_id: 1,
    date: Date.now(),
    chat: { id: 1, type: "private" },
    text: "hello",
  };

  const photoMsg: TgMsg = {
    ...baseMsg,
    message_id: 2,
    text: "photo",
    photo: [
      { file_id: "small", width: 10, height: 10 },
      { file_id: "big", width: 100, height: 100 },
    ],
  };

  const fileMsg: TgMsg = {
    ...baseMsg,
    message_id: 3,
    text: "doc",
    document: { file_id: "doc123", file_name: "doc.pdf" },
  };

  const textMapped = mapTelegramMessage(baseMsg as any);
  assert.ok(textMapped, "text message should map");
  assert.equal(textMapped?.messageType, MessageType.TEXT);
  assert.equal(textMapped?.text, "hello");

  const photoMapped = mapTelegramMessage(photoMsg as any);
  assert.ok(photoMapped, "photo message should map");
  assert.equal(photoMapped?.messageType, MessageType.IMAGE);
  assert.equal(photoMapped?.attachmentMeta?.fileId, "big");

  const fileMapped = mapTelegramMessage(fileMsg as any);
  assert.ok(fileMapped, "file message should map");
  assert.equal(fileMapped?.messageType, MessageType.FILE);
  assert.ok(fileMapped?.attachmentUrl?.includes("doc123"));

  console.log("telegram webhook tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
