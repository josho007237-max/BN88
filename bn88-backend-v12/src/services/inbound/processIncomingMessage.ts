// src/services/inbound/processIncomingMessage.ts

import { prisma } from "../../lib/prisma";
import { getOpenAIClientForBot } from "../openai/getOpenAIClientForBot";
import { sseHub } from "../../lib/sseHub";
import { MessageType } from "@prisma/client";
import { sendTelegramMessage } from "../telegram";
import { createRequestLogger } from "../../utils/logger";
import {
  enqueueFollowUpJob,
  enqueueRateLimitedSend,
} from "../../queues/message.queue";

export type SupportedPlatform = "line" | "telegram" | "facebook";

export type ProcessIncomingParams = {
  botId: string;
  platform: SupportedPlatform;
  userId: string;
  text: string;
  messageType?: MessageType;
  attachmentUrl?: string | null;
  attachmentMeta?: unknown;

  // สำหรับ LINE/Telegram/Facebook ใช้กัน duplicate + log meta
  displayName?: string;
  platformMessageId?: string;
  rawPayload?: unknown;
  requestId?: string;
};

export type ProcessIncomingResult = {
  reply: string;
  intent: string;
  isIssue: boolean;
  actions?: ActionExecutionResult[];
};

// Bot + relations ที่ pipeline นี้ต้องใช้
type BotWithRelations = NonNullable<
  Awaited<ReturnType<typeof loadBotWithRelations>>
>;

// โหลด bot + secret + config + intents (และ preset ถ้าต้องใช้)
async function loadBotWithRelations(botId: string) {
  if (!botId) return null;

  return prisma.bot.findUnique({
    where: { id: botId },
    include: {
      secret: true,
      config: {
        include: {
          preset: true,
        },
      },
      intents: true,
    },
  });
}

type KnowledgeChunkLite = {
  id: string;
  docId: string;
  docTitle: string;
  content: string;
};

type ActionMessagePayload = {
  type?: MessageType;
  text?: string;
  attachmentUrl?: string | null;
  attachmentMeta?: unknown;
};

type SendMessageAction = {
  type: "send_message";
  message: ActionMessagePayload;
};

type TagAction = { type: "tag_add" | "tag_remove"; tag: string };
type SegmentAction = { type: "segment_update"; segment: unknown };
type FollowUpAction = {
  type: "follow_up";
  delaySeconds?: number;
  message: ActionMessagePayload;
};

type ActionItem = SendMessageAction | TagAction | SegmentAction | FollowUpAction;

export type ActionExecutionResult = {
  type: ActionItem["type"];
  status: "handled" | "skipped" | "scheduled" | "error";
  detail?: string;
};

async function getRelevantKnowledgeForBotMessage(params: {
  botId: string;
  tenant: string;
  text: string;
  limit?: number;
}): Promise<KnowledgeChunkLite[]> {
  const { botId, tenant, text, limit = 5 } = params;

  // แยก keyword แบบง่าย ๆ จากข้อความลูกค้า (ไม่ต้องพึ่ง vector DB)
  const keywords = text
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 3)
    .slice(0, 5);

  const whereClause: any = {
    doc: {
      tenant,
      status: "active",
      bots: { some: { botId } },
    },
  };

  if (keywords.length > 0) {
    whereClause.OR = keywords.map((kw) => ({ content: { contains: kw } }));
  }

  const chunks = await prisma.knowledgeChunk.findMany({
    where: whereClause,
    include: {
      doc: {
        select: {
          id: true,
          title: true,
        },
      },
    },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: limit,
  });

  return chunks.map((chunk) => ({
    id: chunk.id,
    docId: chunk.doc.id,
    docTitle: chunk.doc.title,
    content: chunk.content,
  }));
}

function buildKnowledgeSummary(chunks: KnowledgeChunkLite[]): {
  summary: string;
  docIds: string[];
  chunkIds: string[];
} {
  if (chunks.length === 0) {
    return { summary: "", docIds: [], chunkIds: [] };
  }

  const lines: string[] = [];
  let totalLength = 0;
  const maxTotalLength = 1800;
  const maxChunkLength = 360;

  for (const chunk of chunks) {
    if (totalLength >= maxTotalLength) break;

    const content = chunk.content.slice(0, maxChunkLength);
    const line = `- [doc: ${chunk.docTitle}] ${content}`;
    totalLength += line.length;
    lines.push(line);
  }

  return {
    summary: lines.join("\n"),
    docIds: Array.from(new Set(chunks.map((c) => c.docId))),
    chunkIds: chunks.map((c) => c.id),
  };
}

function normalizeActionMessage(
  payload: ActionMessagePayload,
  fallbackText: string
): Required<ActionMessagePayload> {
  const type = payload.type ?? MessageType.TEXT;
  const text = payload.text ?? (payload.attachmentUrl ? fallbackText : "");
  return {
    type,
    text,
    attachmentUrl: payload.attachmentUrl ?? null,
    attachmentMeta: payload.attachmentMeta ?? undefined,
  };
}

async function sendLinePushMessage(args: {
  channelAccessToken?: string | null;
  to: string;
  payload: Required<ActionMessagePayload>;
}) {
  const { channelAccessToken, to, payload } = args;
  if (!channelAccessToken) return false;

  const f = (globalThis as any).fetch as typeof fetch | undefined;
  if (!f) return false;

  const messages: any[] = [];

  if (payload.type === MessageType.IMAGE && payload.attachmentUrl) {
    messages.push({
      type: "image",
      originalContentUrl: payload.attachmentUrl,
      previewImageUrl: payload.attachmentUrl,
    });
  } else if (payload.type === MessageType.FILE && payload.attachmentUrl) {
    messages.push({ type: "text", text: payload.text || payload.attachmentUrl });
  } else if (payload.type === MessageType.STICKER) {
    messages.push({ type: "text", text: payload.text || "[sticker]" });
  } else if (payload.type === MessageType.SYSTEM) {
    messages.push({ type: "text", text: payload.text || "[system]" });
  } else {
    messages.push({ type: "text", text: payload.text || "" });
  }

  const resp = await f("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
  });

  return resp.ok;
}

async function sendTelegramPayload(args: {
  botToken?: string | null;
  chatId: string;
  payload: Required<ActionMessagePayload>;
}) {
  const { botToken, chatId, payload } = args;
  if (!botToken) return false;

  const options = {
    photoUrl:
      payload.type === MessageType.IMAGE ? payload.attachmentUrl ?? undefined : undefined,
    documentUrl:
      payload.type === MessageType.FILE ? payload.attachmentUrl ?? undefined : undefined,
    documentName:
      payload.type === MessageType.FILE
        ? (payload.attachmentMeta as any)?.fileName ?? undefined
        : undefined,
  };

  const textForTg = payload.text || payload.attachmentUrl || "";
  return sendTelegramMessage(botToken, chatId, textForTg, undefined, options);
}

function todayKey(): string {
  // YYYY-MM-DD (ใช้เป็น key ของ StatDaily)
  return new Date().toISOString().slice(0, 10);
}

function safeBroadcast(event: any) {
  try {
    // ตรงนี้อิงสัญญาเดิมว่า sseHub มีเมธอด broadcast(event)
    (sseHub as any).broadcast?.(event);
  } catch (err) {
    console.warn("[inbound] SSE broadcast error", err);
  }
}

type ActionContext = {
  bot: BotWithRelations;
  session: { id: string };
  platform: SupportedPlatform;
  userId: string;
  requestId?: string;
  log: ReturnType<typeof createRequestLogger>;
};

async function executeSendAction(
  action: SendMessageAction,
  ctx: ActionContext
): Promise<ActionExecutionResult> {
  const { bot, session, platform, userId, log } = ctx;
  const normalized = normalizeActionMessage(
    action.message,
    action.message.attachmentUrl ? "attachment" : ""
  );

  try {
    const now = new Date();
    const botChatMessage = await prisma.chatMessage.create({
      data: {
        tenant: bot.tenant,
        botId: bot.id,
        platform,
        sessionId: session.id,
        senderType: "bot",
        type: normalized.type,
        text: normalized.text || null,
        attachmentUrl: normalized.attachmentUrl ?? null,
        attachmentMeta: normalized.attachmentMeta ?? undefined,
        meta: { source: platform, via: "action" },
      },
      select: {
        id: true,
        text: true,
        type: true,
        attachmentUrl: true,
        attachmentMeta: true,
        createdAt: true,
      },
    });

    await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        lastMessageAt: now,
        lastText: normalized.text || normalized.attachmentUrl || undefined,
        lastDirection: "bot",
      },
    });

    safeBroadcast({
      type: "chat:message:new",
      tenant: bot.tenant,
      botId: bot.id,
      sessionId: session.id,
      message: botChatMessage,
    });

    const rateLimited = await enqueueRateLimitedSend({
      id: `${botChatMessage.id}:send`,
      channelId: `${platform}:${bot.id}`,
      requestId: ctx.requestId,
      handler: async () => {
        if (platform === "line") {
          return sendLinePushMessage({
            channelAccessToken: bot.secret?.channelAccessToken,
            to: userId,
            payload: normalized,
          });
        }
        if (platform === "telegram") {
          return sendTelegramPayload({
            botToken: bot.secret?.telegramBotToken,
            chatId: userId,
            payload: normalized,
          });
        }
        return false;
      },
    });

    const delivered = rateLimited.scheduled
      ? false
      : Boolean(rateLimited.result);

    if (rateLimited.scheduled) {
      log.warn("[action] send_message rate-limited", {
        sessionId: session.id,
        platform,
        requestId: ctx.requestId,
        delayMs: rateLimited.delayMs,
      });
    }

    log.info("[action] send_message", {
      sessionId: session.id,
      platform,
      delivered,
      type: normalized.type,
      requestId: ctx.requestId,
    });

    return {
      type: action.type,
      status: delivered ? "handled" : "skipped",
      detail: delivered ? "sent_to_platform" : "stored_only",
    };
  } catch (err) {
    log.error("[action] send_message error", err);
    return { type: action.type, status: "error", detail: String(err) };
  }
}

async function executeSystemNote(
  text: string,
  ctx: ActionContext,
  meta?: Record<string, unknown>
) {
  await prisma.chatMessage.create({
    data: {
      tenant: ctx.bot.tenant,
      botId: ctx.bot.id,
      platform: ctx.platform,
      sessionId: ctx.session.id,
      senderType: "bot",
      type: MessageType.SYSTEM,
      text,
      meta: meta ? (meta as any) : undefined,
    },
  });
}

async function executeTagAction(
  action: TagAction,
  ctx: ActionContext
): Promise<ActionExecutionResult> {
  try {
    await executeSystemNote(`[${action.type}] ${action.tag}`, ctx, {
      action: action.type,
      tag: action.tag,
    });
    ctx.log.info("[action] tag", {
      type: action.type,
      tag: action.tag,
      sessionId: ctx.session.id,
      requestId: ctx.requestId,
    });
    return { type: action.type, status: "handled" };
  } catch (err) {
    ctx.log.error("[action] tag error", err);
    return { type: action.type, status: "error", detail: String(err) };
  }
}

async function executeSegmentAction(
  action: SegmentAction,
  ctx: ActionContext
): Promise<ActionExecutionResult> {
  try {
    await executeSystemNote("[segment_update]", ctx, {
      action: action.type,
      segment: action.segment,
    });
    ctx.log.info("[action] segment_update", {
      sessionId: ctx.session.id,
      requestId: ctx.requestId,
    });
    return { type: action.type, status: "handled" };
  } catch (err) {
    ctx.log.error("[action] segment_update error", err);
    return { type: action.type, status: "error", detail: String(err) };
  }
}

async function executeFollowUpAction(
  action: FollowUpAction,
  ctx: ActionContext
): Promise<ActionExecutionResult> {
  const normalized = normalizeActionMessage(
    action.message,
    action.message.attachmentUrl ? "attachment" : ""
  );
  const delayMs = Math.max(1, (action.delaySeconds ?? 60) * 1000);
  const jobId = `${ctx.session.id}:${normalized.type}:${delayMs}`;

  try {
    await enqueueFollowUpJob({
      id: jobId,
      delayMs,
      payload: normalized,
      requestId: ctx.requestId,
      handler: async (payload) => {
        await executeSendAction({ type: "send_message", message: payload }, ctx);
      },
    });

    ctx.log.info("[action] follow_up scheduled", {
      sessionId: ctx.session.id,
      delayMs,
      requestId: ctx.requestId,
    });

    return { type: action.type, status: "scheduled", detail: jobId };
  } catch (err) {
    ctx.log.error("[action] follow_up error", err);
    return { type: action.type, status: "error", detail: String(err) };
  }
}

async function executeActions(actions: ActionItem[], ctx: ActionContext) {
  const results: ActionExecutionResult[] = [];

  for (const action of actions) {
    if (!action || typeof action !== "object" || !("type" in action)) continue;

    if (action.type === "send_message") {
      results.push(await executeSendAction(action, ctx));
      continue;
    }

    if (action.type === "tag_add" || action.type === "tag_remove") {
      results.push(await executeTagAction(action, ctx));
      continue;
    }

    if (action.type === "segment_update") {
      results.push(await executeSegmentAction(action, ctx));
      continue;
    }

    if (action.type === "follow_up") {
      results.push(await executeFollowUpAction(action, ctx));
      continue;
    }
  }

  return results;
}

export async function processIncomingMessage(
  params: ProcessIncomingParams
): Promise<ProcessIncomingResult> {
  const {
    botId,
    platform,
    userId,
    text,
    displayName,
    platformMessageId,
    rawPayload,
    requestId,
  } = params;

  const log = createRequestLogger(requestId);

  // ถ้าข้อความว่าง ให้ตอบ fallback เลย (กันเคสส่งมาเป็น empty)
  if (!text || !text.trim()) {
    return {
      reply: "ขออภัยค่ะ ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งภายหลังนะคะ",
      intent: "other",
      isIssue: false,
      actions: [],
    };
  }

  // ค่าตอบ fallback ถ้าพัง
  const fallback: ProcessIncomingResult = {
    reply: "ขออภัยค่ะ ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งภายหลังนะคะ",
    intent: "other",
    isIssue: false,
    actions: [],
  };

  let actionResults: ActionExecutionResult[] = [];
  let aiActions: ActionItem[] = [];

  try {
    const bot = await loadBotWithRelations(botId);

    if (!bot) {
      console.warn("[processIncomingMessage] bot not found:", { botId });
      return fallback;
    }
    if (!bot.config) {
      console.warn("[processIncomingMessage] bot config missing:", { botId });
      return fallback;
    }

    const now = new Date();

    // 1) หา/สร้าง ChatSession ก่อน
    //    ใช้ unique constraint botId_userId
    const session = await prisma.chatSession.upsert({
      where: {
        botId_userId: {
          botId: bot.id,
          userId,
        },
      },
      update: {
        lastMessageAt: now,
        displayName: displayName ?? undefined,
      },
      create: {
        tenant: bot.tenant,
        botId: bot.id,
        platform,
        userId,
        displayName: displayName ?? undefined,
        lastMessageAt: now,
      },
    });

    // 2) กัน duplicate message ด้วย platformMessageId
    if (platformMessageId) {
      const dup = await prisma.chatMessage.findFirst({
        where: {
          sessionId: session.id,
          platformMessageId,
        },
        select: { id: true },
      });

      if (dup) {
        console.log("[processIncomingMessage] duplicate message, skip", {
          sessionId: session.id,
          platformMessageId,
        });

        // ไม่ทำอะไรซ้ำ ไม่ตอบลูกค้าอีกรอบ
        return {
          reply: "",
          intent: "duplicate",
          isIssue: false,
        };
      }
    }

    const incomingType: MessageType = params.messageType ?? "TEXT";
    const safeText = text?.trim() || (incomingType !== "TEXT" ? `[${incomingType.toLowerCase()}]` : "");

    // 3) บันทึกข้อความฝั่ง user → ChatMessage
    const userChatMessage = await prisma.chatMessage.create({
      data: {
        tenant: bot.tenant,
        botId: bot.id,
        platform,
        sessionId: session.id,
        senderType: "user",
        type: incomingType,
        text: safeText || null,
        attachmentUrl: params.attachmentUrl ?? null,
        attachmentMeta: params.attachmentMeta ?? undefined,
        platformMessageId: platformMessageId ?? null,
        meta: {
          source: platform,
          rawPayload: rawPayload ?? null,
        },
      },
      select: {
        id: true,
        createdAt: true,
        text: true,
        type: true,
        attachmentUrl: true,
        attachmentMeta: true,
      },
    });

    // broadcast SSE (ฝั่ง user)
    safeBroadcast({
      type: "chat:message:new",
      tenant: bot.tenant,
      botId: bot.id,
      sessionId: session.id,
      message: {
        id: userChatMessage.id,
        senderType: "user",
        text: userChatMessage.text,
        type: userChatMessage.type,
        attachmentUrl: userChatMessage.attachmentUrl,
        attachmentMeta: userChatMessage.attachmentMeta,
        createdAt: userChatMessage.createdAt,
      },
    });

    // ถ้าไม่ใช่ข้อความ text ให้หยุดที่นี่ (ไม่ต้องเรียก AI)
    if (incomingType !== "TEXT") {
      return { reply: "", intent: "non_text", isIssue: false, actions: [] };
    }

    // 4) เตรียม client OpenAI ตาม secret/config ของบอท
    let openai;
    try {
      openai = getOpenAIClientForBot(bot as BotWithRelations);
    } catch (err) {
      console.error(
        "[processIncomingMessage] getOpenAIClientForBot error",
        (err as any)?.message ?? err
      );
      // ถ้าไม่มี key หรือสร้าง client ไม่ได้ → ตอบ fallback เลย
      return fallback;
    }

    // 4.1) ดึง knowledge ที่เกี่ยวข้องกับข้อความนี้ (ถ้ามี)
    const knowledgeChunks = await getRelevantKnowledgeForBotMessage({
      botId: bot.id,
      tenant: bot.tenant,
      text,
    });

    const { summary: knowledgeSummary, docIds: knowledgeDocIds, chunkIds } =
      buildKnowledgeSummary(knowledgeChunks);

    if (knowledgeChunks.length > 0) {
      console.log("[processIncomingMessage] knowledge", {
        botId: bot.id,
        docs: knowledgeDocIds,
        chunks: chunkIds.slice(0, 10),
      });
    }

    // 5) เตรียม intents สำหรับส่งเข้า prompt
    const intentsForPrompt =
      bot.intents && bot.intents.length > 0
        ? bot.intents
            .map((it) => {
              const keywords = Array.isArray(it.keywords)
                ? (it.keywords as string[])
                : [];

              return `- code: ${it.code}
  title: ${it.title}
  keywords: ${keywords.join(", ")}`;
            })
            .join("\n")
        : "ไม่พบ intent ใด ๆ ให้ตอบ intent = other";

    const baseSystemPrompt =
      bot.config.systemPrompt ||
      "คุณคือแอดมินดูแลลูกค้า ให้ตอบแบบสุภาพ กระชับ และเป็นมนุษย์";

    const classificationInstruction = `
คุณมีหน้าที่:
1) วิเคราะห์ข้อความลูกค้า
2) เลือก intent หนึ่งตัวจากรายการด้านล่าง (ถ้าไม่เข้า ให้ใช้ "other")
3) ตัดสินใจว่าเป็น "เคสปัญหา" จริงไหม (เช่น ฝากไม่เข้า, ถอนไม่ได้, ทำรายการไม่สำเร็จ ฯลฯ)
4) สร้างข้อความตอบกลับลูกค้า

แพลตฟอร์มที่ลูกค้าใช้งาน: ${platform}

รายการ intent:
${intentsForPrompt}

ให้ตอบกลับในรูปแบบ JSON เท่านั้น ห้ามใส่ข้อความอื่นเพิ่ม
โครงสร้าง JSON:

{
  "reply": "ข้อความที่ใช้ตอบลูกค้า",
  "intent": "code ของ intent เช่น deposit, withdraw, register, kyc, other",
  "isIssue": true หรือ false
}
`.trim();

    const systemPrompt = `${baseSystemPrompt}\n\n${classificationInstruction}`;

    const model = bot.config.model || "gpt-4o-mini";

    // 6) เรียก OpenAI ให้จัด intent + บทตอบ
    const completion = await openai.chat.completions.create({
      model,
      temperature: bot.config.temperature ?? 0.4,
      top_p: bot.config.topP ?? 1,
      max_tokens: bot.config.maxTokens ?? 800,
      messages: [
        { role: "system", content: systemPrompt },
        knowledgeSummary
          ? {
              role: "system",
              content:
                "นี่คือข้อมูลภายใน (Knowledge Base) ที่ต้องใช้ตอบลูกค้า ถ้าคำถามเกี่ยวข้องให้ยึดข้อมูลนี้เป็นหลัก:\n" +
                knowledgeSummary,
            }
          : null,
        { role: "user", content: text },
      ].filter(Boolean) as any,
    });

    let rawContent: any = completion.choices[0]?.message?.content ?? "{}";

    // กรณี content เป็น array (รองรับ format บางแบบของ lib)
    if (Array.isArray(rawContent)) {
      rawContent = rawContent
        .map((p: any) =>
          typeof p === "string" ? p : p?.text ?? p?.content ?? ""
        )
        .join("");
    }

    let parsed: ProcessIncomingResult = {
      reply: "ขอบคุณสำหรับข้อมูลค่ะ",
      intent: "other",
      isIssue: false,
      actions: [],
    };

    try {
      const json = JSON.parse(String(rawContent));

      parsed = {
        reply:
          typeof json.reply === "string"
            ? json.reply
            : "ขอบคุณสำหรับข้อมูลค่ะ",
        intent: typeof json.intent === "string" ? json.intent : "other",
        isIssue: Boolean(json.isIssue),
        actions: [],
      };

      aiActions = Array.isArray(json.actions) ? (json.actions as ActionItem[]) : [];
    } catch (err) {
      console.error(
        "[processIncomingMessage] JSON parse error from GPT",
        err,
        rawContent
      );
    }

    const reply = parsed.reply || "ขอบคุณสำหรับข้อมูลค่ะ";
    const intent = parsed.intent || "other";
    const isIssue = Boolean(parsed.isIssue);

    // 7) ถ้าเป็นเคสปัญหา → บันทึก CaseItem + StatDaily
    let caseId: string | null = null;
    const dateKey = todayKey();

    if (isIssue) {
      try {
        const createdCase = await prisma.caseItem.create({
          data: {
            botId: bot.id,
            tenant: bot.tenant,
            platform,
            sessionId: session.id,
            userId,
            kind: intent,
            text,
            meta: {
              source: platform,
              rawPayload: rawPayload ?? null,
            },
          },
          select: {
            id: true,
            createdAt: true,
            text: true,
            kind: true,
          },
        });

        caseId = createdCase.id;

        await prisma.statDaily.upsert({
          where: {
            botId_dateKey: {
              botId: bot.id,
              dateKey,
            },
          },
          update: {
            total: { increment: 1 },
            text: { increment: 1 },
          },
          create: {
            botId: bot.id,
            tenant: bot.tenant,
            dateKey,
            total: 1,
            text: 1,
            follow: 0,
            unfollow: 0,
          },
        });

        // SSE: case + stats
        safeBroadcast({
          type: "case:new",
          tenant: bot.tenant,
          botId: bot.id,
          case: {
            id: createdCase.id,
            text: createdCase.text,
            kind: createdCase.kind,
            createdAt: createdCase.createdAt,
            sessionId: session.id,
          },
        });

        safeBroadcast({
          type: "stats:update",
          tenant: bot.tenant,
          botId: bot.id,
          dateKey,
          delta: { total: 1, text: 1 },
        });
      } catch (err) {
        console.error(
          "[processIncomingMessage] error while creating case/stat",
          (err as any)?.message ?? err
        );
      }
    } else {
      // non-issue แต่อาจอยากนับสถิติข้อความรวมด้วยก็ได้
      try {
        await prisma.statDaily.upsert({
          where: {
            botId_dateKey: {
              botId: bot.id,
              dateKey,
            },
          },
          update: {
            total: { increment: 1 },
            text: { increment: 1 },
          },
          create: {
            botId: bot.id,
            tenant: bot.tenant,
            dateKey,
            total: 1,
            text: 1,
            follow: 0,
            unfollow: 0,
          },
        });

        safeBroadcast({
          type: "stats:update",
          tenant: bot.tenant,
          botId: bot.id,
          dateKey,
          delta: { total: 1, text: 1 },
        });
      } catch (err) {
        console.error(
          "[processIncomingMessage] statDaily non-issue error",
          (err as any)?.message ?? err
        );
      }
    }

    // 8) บันทึกข้อความฝั่ง bot + SSE
    if (reply) {
      try {
        const botChatMessage = await prisma.chatMessage.create({
          data: {
            tenant: bot.tenant,
            botId: bot.id,
            platform,
            sessionId: session.id,
            senderType: "bot",
            type: "TEXT",
            text: reply,
            meta: {
              source: platform,
              via: "auto_reply",
              intent,
              isIssue,
              caseId,
              usedKnowledge: knowledgeChunks.length > 0,
              knowledgeDocIds,
              knowledgeChunkIds: chunkIds,
            },
          },
          select: {
            id: true,
            text: true,
            type: true,
            createdAt: true,
          },
        });

        safeBroadcast({
          type: "chat:message:new",
          tenant: bot.tenant,
          botId: bot.id,
          sessionId: session.id,
          message: {
            id: botChatMessage.id,
            senderType: "bot",
            text: botChatMessage.text,
            type: botChatMessage.type,
            createdAt: botChatMessage.createdAt,
          },
        });
      } catch (err) {
        console.error(
          "[processIncomingMessage] ingest bot message error",
          (err as any)?.message ?? err
        );
      }
    }

    const actionsToRun = aiActions;

    if (actionsToRun.length > 0) {
      actionResults = await executeActions(actionsToRun, {
        bot: bot as BotWithRelations,
        session,
        platform,
        userId,
        requestId,
        log,
      });
    }

    return { reply, intent, isIssue, actions: actionResults };
  } catch (err) {
    console.error(
      "[processIncomingMessage] fatal error",
      (err as any)?.message ?? err
    );
    // อย่าโยน error ออกไป ให้ส่ง fallback กลับ
    return { ...fallback, actions: actionResults };
  }
}
