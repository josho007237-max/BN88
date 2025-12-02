// src/services/knowledge.service.ts
import { prisma } from "../lib/prisma";

export type RelevantChunk = {
  docId: string;
  docTitle: string;
  chunkId: string;
  heading: string | null;
  content: string;
};

export async function getRelevantChunksForMessage(
  botId: string,
  text: string,
  limit: number = 6
): Promise<RelevantChunk[]> {
  if (!text || !text.trim()) return [];

  const keywords = text
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 5);

  // ดึง KnowledgeDoc ที่ถูกผูกกับ botId นี้ ผ่าน relation botKnowledges
  const docs = await prisma.knowledgeDoc.findMany({
    where: {
      status: "active",
      botKnowledges: {
        some: {
          botId,
        },
      },
    },
    include: {
      chunks: true,
    },
  });

  if (!docs.length) return [];

  type ScoredChunk = RelevantChunk & { score: number };

  const scored: ScoredChunk[] = [];

  for (const doc of docs as any[]) {
    for (const chunk of doc.chunks as any[]) {
      let score = 0;
      const lowerContent = (chunk.content as string).toLowerCase();

      for (const kw of keywords) {
        if (lowerContent.includes(kw.toLowerCase())) {
          score += 1;
        }
      }

      if (score > 0) {
        scored.push({
          docId: doc.id as string,
          docTitle: doc.title as string,
          chunkId: chunk.id as string,
          heading: (chunk.heading as string) ?? null,
          content: chunk.content as string,
          score,
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ score, ...rest }) => rest);
}

/**
 * Helper: ประกอบ messages สำหรับ OpenAI พร้อม context จาก Knowledge
 */
export async function buildMessagesWithKnowledge(params: {
  botId: string;
  userText: string;
  baseSystemPrompt: string;
}) {
  const { botId, userText, baseSystemPrompt } = params;

  const chunks = await getRelevantChunksForMessage(botId, userText);

  const contextText = chunks
    .map((c, index) => {
      const title = c.heading || c.docTitle || `Doc ${index + 1}`;
      return `(${index + 1}) [${title}]\n${c.content}`;
    })
    .join("\n\n");

  const systemPromptWithKnowledge = `
${baseSystemPrompt}

[เอกสารความรู้]
${contextText || "(ยังไม่มีข้อมูลเฉพาะ ให้ใช้ความรู้ทั่วไป แต่ระบุให้สุภาพว่าเป็นข้อมูลทั่วไป)"}
  `.trim();

  const messages = [
    { role: "system", content: systemPromptWithKnowledge },
    { role: "user", content: userText },
  ];

  return { messages, contextText };
}
