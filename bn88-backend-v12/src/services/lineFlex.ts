import { MessageType } from "@prisma/client";

export type FlexButtonAction = "uri" | "message" | "postback";
export type FlexButton = {
  label: string;
  action: FlexButtonAction;
  value: string;
};

export type FlexCardInput = {
  title: string;
  body: string;
  imageUrl?: string;
  buttons?: FlexButton[];
};

export type FlexMessageInput = {
  altText?: string;
  cards: FlexCardInput[];
};

export function buildFlexMessage(payload: FlexMessageInput) {
  const cards = payload.cards && payload.cards.length > 0 ? payload.cards : [];
  const bubbles = (cards.length ? cards : [{ title: "", body: "" }]).map((card) => {
    const contents: any = {
      type: "bubble",
      hero: card.imageUrl
        ? {
            type: "image",
            url: card.imageUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
          }
        : undefined,
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: card.title || "",
            weight: "bold",
            size: "lg",
            wrap: true,
          },
          {
            type: "text",
            text: card.body || "",
            wrap: true,
            size: "sm",
            color: "#d4d4d8",
          },
        ],
      },
      footer: card.buttons && card.buttons.length
        ? {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: card.buttons.map((btn) => {
              const base: any = { type: "button", style: "primary", height: "sm" };
              if (btn.action === "uri") {
                base.action = { type: "uri", label: btn.label, uri: btn.value };
              } else if (btn.action === "postback") {
                base.action = { type: "postback", label: btn.label, data: btn.value };
              } else {
                base.action = { type: "message", label: btn.label, text: btn.value };
              }
              return base;
            }),
          }
        : undefined,
    } as any;

    if (!contents.hero) delete contents.hero;
    if (!contents.footer) delete contents.footer;
    return contents;
  });

  const contents = bubbles.length > 1
    ? { type: "carousel", contents: bubbles }
    : bubbles[0];

  return {
    type: "flex",
    altText: payload.altText || cards[0]?.title || "Rich message",
    contents,
  } as const;
}

export function normalizeLineRichMessage(
  type: MessageType,
  text: string,
  attachmentUrl?: string | null,
  attachmentMeta?: Record<string, unknown>
) {
  if (type === "RICH" && attachmentMeta && "cards" in attachmentMeta) {
    return attachmentMeta;
  }
  return {
    type: "text",
    text,
  } as any;
}
