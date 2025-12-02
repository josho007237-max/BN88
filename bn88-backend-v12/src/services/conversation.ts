import { prisma } from "../lib/prisma";
import { createRequestLogger } from "../utils/logger";

export async function ensureConversation(
  opts: {
    botId: string;
    tenant: string;
    userId: string;
    platform: string;
    requestId?: string;
  },
  client = prisma,
) {
  const log = createRequestLogger(opts.requestId);

  const conversation = await client.conversation.upsert({
    where: { botId_userId: { botId: opts.botId, userId: opts.userId } },
    update: { updatedAt: new Date(), platform: opts.platform },
    create: {
      botId: opts.botId,
      tenant: opts.tenant,
      userId: opts.userId,
      platform: opts.platform,
    },
  });

  log.info({
    requestId: opts.requestId,
    conversationId: conversation.id,
    botId: opts.botId,
    userId: opts.userId,
  }, "ensure_conversation");

  return conversation;
}
