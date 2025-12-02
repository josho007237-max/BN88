import { prisma } from "../../lib/prisma";
import { MessageType } from "@prisma/client";
import {
  ActionContext,
  ActionExecutionResult,
  ActionMessagePayload,
  SegmentAction,
  TagAction,
} from "./types";
import { normalizeActionMessage } from "./utils";

async function createSystemNote(
  text: string,
  ctx: ActionContext,
  meta?: Record<string, unknown>,
  deps = prisma,
) {
  await deps.chatMessage.create({
    data: {
      tenant: ctx.bot.tenant,
      botId: ctx.bot.id,
      platform: ctx.platform,
      sessionId: ctx.session.id,
      conversationId: ctx.conversation?.id,
      senderType: "bot",
      type: MessageType.SYSTEM,
      text,
      meta: meta ? (meta as any) : undefined,
    },
  });
}

function memoryKey(sessionId: string, key: string) {
  return { userRef: sessionId, key };
}

async function upsertTags(
  ctx: ActionContext,
  tags: string[],
  deps = prisma,
) {
  return deps.memoryItem.upsert({
    where: {
      tenant_userRef_key: { tenant: ctx.bot.tenant, ...memoryKey(ctx.session.id, "tags") },
    },
    update: { value: JSON.stringify(tags), tags },
    create: {
      tenant: ctx.bot.tenant,
      ...memoryKey(ctx.session.id, "tags"),
      value: JSON.stringify(tags),
      tags,
    },
  });
}

async function upsertSegment(
  ctx: ActionContext,
  segment: unknown,
  deps = prisma,
) {
  return deps.memoryItem.upsert({
    where: {
      tenant_userRef_key: { tenant: ctx.bot.tenant, ...memoryKey(ctx.session.id, "segment") },
    },
    update: { value: JSON.stringify(segment) },
    create: {
      tenant: ctx.bot.tenant,
      ...memoryKey(ctx.session.id, "segment"),
      value: JSON.stringify(segment),
    },
  });
}

export async function executeTagAction(
  action: TagAction,
  ctx: ActionContext,
  deps = prisma,
): Promise<ActionExecutionResult> {
  try {
    const existing = await deps.memoryItem.findUnique({
      where: {
        tenant_userRef_key: { tenant: ctx.bot.tenant, ...memoryKey(ctx.session.id, "tags") },
      },
    });
    const currentTags: string[] = Array.isArray(existing?.tags)
      ? (existing?.tags as string[])
      : Array.isArray(existing?.value)
        ? (existing?.value as string[])
        : [];

    let nextTags = [...currentTags];
    if (action.type === "tag_add") {
      nextTags = Array.from(new Set([...currentTags, action.tag]));
    } else {
      nextTags = currentTags.filter((t) => t !== action.tag);
    }

    await upsertTags(ctx, nextTags, deps);
    await createSystemNote(`[${action.type}] ${action.tag}`, ctx, {
      action: action.type,
      tag: action.tag,
    }, deps);

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

export async function executeSegmentAction(
  action: SegmentAction,
  ctx: ActionContext,
  deps = prisma,
): Promise<ActionExecutionResult> {
  try {
    await upsertSegment(ctx, action.segment, deps);
    await createSystemNote("[segment_update]", ctx, {
      action: action.type,
      segment: action.segment,
    }, deps);
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

export async function executeSystemSend(
  ctx: ActionContext,
  payload: ActionMessagePayload,
  deps = prisma,
) {
  const normalized = normalizeActionMessage(payload, payload.attachmentUrl ? "attachment" : "");
  await deps.chatMessage.create({
    data: {
      tenant: ctx.bot.tenant,
      botId: ctx.bot.id,
      platform: ctx.platform,
      sessionId: ctx.session.id,
      conversationId: ctx.conversation?.id,
      senderType: "bot",
      type: normalized.type,
      text: normalized.text || "",
      attachmentUrl: normalized.attachmentUrl ?? null,
      attachmentMeta: normalized.attachmentMeta ?? undefined,
      meta: { source: ctx.platform, via: "action" },
    },
  });
}
