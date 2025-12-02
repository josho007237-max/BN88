import { prisma } from "../lib/prisma";
import { createRequestLogger } from "../utils/logger";

export async function findFaqAnswer(
  botId: string,
  text: string,
  requestId?: string
): Promise<{ answer: string; faqId: string } | null> {
  const log = createRequestLogger(requestId);
  const trimmed = text.toLowerCase();
  const faqs = await prisma.fAQ.findMany({
    where: { botId },
    orderBy: { createdAt: "asc" },
  });

  for (const faq of faqs) {
    if (trimmed.includes(faq.question.toLowerCase())) {
      log.info("[faq] matched", { faqId: faq.id });
      return { answer: faq.answer, faqId: faq.id };
    }
  }

  if (trimmed.includes("?") && faqs[0]) {
    log.info("[faq] fallback first faq", { faqId: faqs[0].id });
    return { answer: faqs[0].answer, faqId: faqs[0].id };
  }

  return null;
}
