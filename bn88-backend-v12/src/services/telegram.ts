// src/services/telegram.ts

export type TelegramSendOptions = {
  replyToMessageId?: string | number;
  photoUrl?: string;
  documentUrl?: string;
  documentName?: string;
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
};

export type TelegramPollOption = { text: string };

export async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  replyToMessageId?: string | number,
  options?: TelegramSendOptions
): Promise<boolean> {
  const f = (globalThis as any).fetch as typeof fetch | undefined;
  if (!f) {
    console.error("[Telegram] global fetch is not available");
    return false;
  }

  const hasPhoto = Boolean(options?.photoUrl);
  const hasDocument = Boolean(options?.documentUrl);

  const url = hasPhoto
    ? `https://api.telegram.org/bot${botToken}/sendPhoto`
    : hasDocument
      ? `https://api.telegram.org/bot${botToken}/sendDocument`
      : `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body: any = {
    chat_id: chatId,
  };

  if (hasPhoto) {
    body.photo = options?.photoUrl;
    if (text) body.caption = text;
  } else if (hasDocument) {
    body.document = options?.documentUrl;
    if (options?.documentName) body.caption = options.documentName;
    if (text && !options?.documentName) body.caption = text;
  } else {
    body.text = text;
  }

  if (options?.inlineKeyboard?.length) {
    body.reply_markup = {
      inline_keyboard: options.inlineKeyboard,
    };
  }

  if (replyToMessageId) {
    body.reply_to_message_id = replyToMessageId;
  }

  let lastError: any = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await f(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw = await resp.text().catch(() => "");

      if (!resp.ok) {
        console.error(
          `[Telegram] send error attempt ${attempt}: status=${resp.status}, body=${raw}`
        );
        throw new Error(`Telegram ${resp.status}`);
      }

      console.log("[Telegram] sendMessage OK");
      return true;
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message ?? err);

      console.error(
        `[Telegram] send error attempt ${attempt}:`,
        msg
      );

      if (
        attempt < 3 &&
        /ECONNRESET|ETIMEDOUT|ENETUNREACH|ECONNREFUSED/i.test(msg)
      ) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }

      break;
    }
  }

  console.error("[Telegram] send failed after retries:", lastError);
  return false;
}

export async function startTelegramLive(
  botToken: string,
  channelId: number | string,
  title: string,
  description?: string
) {
  const f = (globalThis as any).fetch as typeof fetch | undefined;
  if (!f) return false;
  const text = `\u{1F3A5} LIVE: ${title}${description ? "\n" + description : ""}`;
  return sendTelegramMessage(botToken, channelId, text);
}

export async function sendTelegramPoll(
  botToken: string,
  channelId: number | string,
  question: string,
  options: string[]
) {
  const f = (globalThis as any).fetch as typeof fetch | undefined;
  if (!f) return false;
  const url = `https://api.telegram.org/bot${botToken}/sendPoll`;
  const body = {
    chat_id: channelId,
    question,
    options,
    is_anonymous: false,
  };
  const resp = await f(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    console.error("[Telegram] sendPoll error", await resp.text().catch(() => ""));
    return false;
  }
  return true;
}
