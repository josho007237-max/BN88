import { strict as assert } from "node:assert";
import { mapTelegramCallback } from "../src/routes/webhooks/telegram";

(async () => {
  const cb = {
    id: "cb1",
    data: "BTN_1",
    from: { id: 123, first_name: "Tester" },
    message: { chat: { id: 123, type: "private" }, message_id: 77, date: Date.now() / 1000 },
  } as any;

  const mapped = mapTelegramCallback(cb);
  assert(mapped);
  assert.equal(mapped?.messageType, "INLINE_KEYBOARD");
  assert.equal(mapped?.text, "BTN_1");
  assert.equal((mapped?.attachmentMeta as any).callbackId, "cb1");
})();
