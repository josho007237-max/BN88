// src/services/openai.service.ts
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY || "";

if (!apiKey) {
  console.warn("[openai] WARNING: OPENAI_API_KEY is not set");
}

const client = new OpenAI({ apiKey });

/**
 * รูปแบบข้อความที่ใช้คุยกับ AI ภายในระบบ
 * (ให้ใช้ type นี้ร่วมกับ processIncomingMessage และ knowledge.service)
 */
export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CallOpenAiChatParams = {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type CallOpenAiChatResult = {
  reply: string;
  intent: string | null;
  isIssue: boolean;
  raw: any;
};

export async function callOpenAiChat(
  params: CallOpenAiChatParams
): Promise<CallOpenAiChatResult> {
  const {
    messages,
    model = "gpt-4o-mini",
    temperature = 0.3,
    maxTokens = 800,
  } = params;

  // map ให้ชัดเจนอีกที เผื่ออนาคต AiChatMessage เพิ่ม field อื่น
  const openAiMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const completion = await client.chat.completions.create({
    model,
    messages: openAiMessages,
    temperature,
    max_tokens: maxTokens,
  });

  const content = completion.choices[0]?.message?.content ?? "";

  let reply = content;
  let intent: string | null = null;
  let isIssue = false; // เป็น boolean ล้วน ไม่ใช่ boolean | undefined

  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.reply === "string") {
        reply = parsed.reply;
      }
      if (typeof parsed.intent === "string") {
        intent = parsed.intent;
      }
      if (typeof parsed.isIssue === "boolean") {
        isIssue = parsed.isIssue;
      }
    }
  } catch {
    // ถ้า parse JSON ไม่ได้ ใช้ content ตรง ๆ
  }

  return {
    reply,
    intent,
    isIssue,
    raw: completion,
  };
}
