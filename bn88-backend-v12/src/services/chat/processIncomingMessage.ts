// src/services/chat/processIncomingMessage.ts

import { buildMessagesWithKnowledge } from "../knowledge.service";
import { callOpenAiChat } from "../openai.service";
import type {
  CallOpenAiChatResult,
  AiChatMessage,
} from "../openai.service";

export type ProcessIncomingMessageParams = {
  botId: string;
  text: string;
  sessionId: string;
  // ถ้ามีพารามิเตอร์อื่น เช่น tenant, platform ฯลฯ เติมตรงนี้ได้
};

export type ProcessIncomingMessageResult = {
  reply: string;
  intent: string | null;
  isIssue: boolean;
  rawAiResult: any;
  usedKnowledgeContext: string;
};

export async function processIncomingMessage(
  params: ProcessIncomingMessageParams
): Promise<ProcessIncomingMessageResult> {
  const { botId, text } = params;

  // 1) system prompt พื้นฐาน (บุคลิก "พี่พลอย")
  const baseSystemPrompt = `
คุณคือ "พี่พลอย" แอดมินผู้ช่วยตอบลูกค้า เป็นมิตร สุภาพ และชัดเจน
หน้าที่ของคุณ:
- ตอบคำถามลูกค้าให้เข้าใจง่าย
- ถ้าคำถามเกี่ยวข้องกับข้อมูลใน "เอกสารความรู้" ให้ใช้ข้อมูลนั้นเป็นหลัก
- ถ้าไม่มีข้อมูลในเอกสาร ให้ตอบตามความเข้าใจทั่วไป แต่ห้ามมั่วเกินจริง
- ถ้าข้อมูลไม่พอ ให้บอกลูกค้าตรง ๆ อย่างสุภาพว่าข้อมูลไม่ครบ
`.trim();

  // 2) ให้ service knowledge ดึง chunk ที่เกี่ยวข้อง + ประกอบ messages ให้
  const { messages, contextText } = await buildMessagesWithKnowledge({
    botId,
    userText: text,
    baseSystemPrompt,
  });

  // 2.1) แปลง messages จาก knowledge service ให้เป็น AiChatMessage[]
  // ป้องกันปัญหา role: string ไม่ตรงกับ union type
  const aiMessages: AiChatMessage[] = (messages as any[]).map(
    (m: any): AiChatMessage => {
      const rawRole: unknown = m.role;

      const role: AiChatMessage["role"] =
        rawRole === "system" || rawRole === "assistant" || rawRole === "user"
          ? rawRole
          : "user"; // ถ้าเป็นค่าอื่น ให้ดีฟอลต์เป็น user ไปก่อน

      return {
        role,
        content: typeof m.content === "string" ? m.content : "",
      };
    }
  );

  // 3) เรียก OpenAI ผ่านฟังก์ชันกลาง
  const aiResult: CallOpenAiChatResult = await callOpenAiChat({
    messages: aiMessages,
    // ถ้ามี config จาก BotConfig ที่ต้องใช้ (model, temperature, maxTokens)
    // คุณสามารถดึงมาใส่เพิ่มตรงนี้ได้ เช่น:
    // model,
    // temperature,
    // maxTokens,
  });

  return {
    reply: aiResult.reply,
    intent: aiResult.intent ?? null,
    isIssue: aiResult.isIssue,
    rawAiResult: aiResult.raw,
    usedKnowledgeContext: contextText,
  };
}
