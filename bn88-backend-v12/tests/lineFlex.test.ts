import { strict as assert } from "node:assert";
import { buildFlexMessage } from "../src/services/lineFlex";

(async () => {
  const msg = buildFlexMessage({
    altText: "hello",
    cards: [
      {
        title: "Promo",
        body: "Limited offer",
        imageUrl: "https://example.com/img.png",
        buttons: [
          { label: "Open", action: "uri", value: "https://example.com" },
          { label: "Ping", action: "message", value: "hi" },
        ],
      },
      {
        title: "Second",
        body: "Line 2",
      },
    ],
  });

  assert.equal(msg.type, "flex");
  assert.equal(msg.altText, "hello");
  assert.equal((msg as any).contents.type, "carousel");
  const first = (msg as any).contents.contents[0];
  assert.equal(first.hero.url, "https://example.com/img.png");
  assert.equal(first.body.contents[0].text, "Promo");
  assert.equal(first.footer.contents.length, 2);
})();
