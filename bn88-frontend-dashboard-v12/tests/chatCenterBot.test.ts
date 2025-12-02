import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FaqList, EngagementList, BotPreviewCard } from "../src/pages/ChatCenter";
import { type FaqEntry, type EngagementMessage } from "../src/lib/api";

const sampleFaqs: FaqEntry[] = [
  {
    id: "faq1",
    botId: "b1",
    question: "ฝากไม่เข้า?",
    answer: "กรุณาส่งสลิป",
    keywords: ["ฝาก", "สลิป"],
    enabled: true,
  },
];

const sampleEngagements: EngagementMessage[] = [
  {
    id: "eng1",
    botId: "b1",
    platform: "telegram",
    channelId: "@channel",
    text: "เข้าร่วมโพลล์ตอนนี้",
    intervalMinutes: 30,
    enabled: true,
  },
];

describe("ChatCenter Bot automation components", () => {
  it("renders FAQ pairs in list", () => {
    const html = renderToStaticMarkup(
      <FaqList items={sampleFaqs} loading={false} />
    );
    expect(html).toContain("ฝากไม่เข้า?");
    expect(html).toContain("กรุณาส่งสลิป");
  });

  it("renders engagement messages in list", () => {
    const html = renderToStaticMarkup(
      <EngagementList items={sampleEngagements} loading={false} />
    );
    expect(html).toContain("@channel");
    expect(html).toContain("เข้าร่วมโพลล์ตอนนี้");
  });

  it("updates preview when FAQ/engagement provided", () => {
    const html = renderToStaticMarkup(
      <BotPreviewCard
        platform="line"
        sampleFaq={sampleFaqs[0]}
        sampleEngagement={sampleEngagements[0]}
      />
    );
    expect(html).toContain("ฝากไม่เข้า?");
    expect(html).toContain("เข้าร่วมโพลล์ตอนนี้");
  });
});
