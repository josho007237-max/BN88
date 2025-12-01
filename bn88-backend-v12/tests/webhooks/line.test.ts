import assert from "node:assert/strict";
import { MessageType } from "@prisma/client";

process.env.SECRET_ENC_KEY_BN9 ||= "12345678901234567890123456789012";
process.env.JWT_SECRET ||= "test-jwt";
process.env.ENABLE_ADMIN_API ||= "1";
process.env.DATABASE_URL ||= "file:./dev.db";

type LineMsg = { id?: string; type: string; text?: string; fileName?: string };

async function run() {
  const { mapLineMessage } = await import("../../src/routes/webhooks/line");

  const textMsg: LineMsg = { id: "1", type: "text", text: "hello" };
  const imageMsg: LineMsg = { id: "img123", type: "image", text: "pic" };
  const fileMsg: LineMsg = {
    id: "file123",
    type: "file",
    text: "report",
    fileName: "report.pdf",
  };

  const textMapped = mapLineMessage(textMsg as any);
  assert.ok(textMapped, "text message should map");
  assert.equal(textMapped?.messageType, MessageType.TEXT);
  assert.equal(textMapped?.text, "hello");

  const imageMapped = mapLineMessage(imageMsg as any);
  assert.ok(imageMapped, "image message should map");
  assert.equal(imageMapped?.messageType, MessageType.IMAGE);
  assert.ok(
    imageMapped?.attachmentUrl?.includes("img123"),
    "image should expose content url"
  );

  const fileMapped = mapLineMessage(fileMsg as any);
  assert.ok(fileMapped, "file message should map");
  assert.equal(fileMapped?.messageType, MessageType.FILE);
  assert.equal(fileMapped?.text, "report");
  assert.ok(
    fileMapped?.attachmentUrl?.includes("file123"),
    "file should expose content url"
  );

  console.log("line webhook tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
