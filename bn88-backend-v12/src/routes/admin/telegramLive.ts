import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { startTelegramLive, sendTelegramPoll } from "../../services/telegram";
import { createRequestLogger, getRequestId } from "../../utils/logger";
import { emit } from "../../live";
import { authGuard } from "../../mw/auth";

const router = Router();

const startSchema = z.object({
  channelId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  botToken: z.string().optional(),
  tenant: z.string().optional(),
});

export async function handleLiveStart(req: any, res: any) {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "invalid_body", issues: parsed.error.flatten() });
  }
  const { channelId, title, description, botToken, tenant } = parsed.data;
  const requestId = getRequestId();
  const logger = createRequestLogger(requestId);
  try {
    const stream = await prisma.liveStream.create({
      data: {
        channelId,
        title,
        description,
        status: "live",
      },
    });
    if (botToken) {
      await startTelegramLive(botToken, channelId, title, description);
    }
    emit("live:start", tenant ?? "bn9", { stream, requestId });
    logger.info("[live] start", { channelId, title });
    return res.json({ ok: true, stream });
  } catch (err: any) {
    logger.error("[live] start error", { err: err?.message });
    return res.status(500).json({ ok: false, message: "live_start_failed" });
  }
}

const qnaSchema = z.object({
  liveStreamId: z.string(),
  userId: z.string().optional(),
  question: z.string().min(1),
  tenant: z.string().optional(),
});

export async function handleLiveQna(req: any, res: any) {
  const parsed = qnaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "invalid_body", issues: parsed.error.flatten() });
  }
  const { liveStreamId, userId, question, tenant } = parsed.data;
  const requestId = getRequestId();
  const logger = createRequestLogger(requestId);
  try {
    const q = await prisma.liveQuestion.create({
      data: { liveStreamId, userId, question },
    });
    emit("live:qna:new", tenant ?? "bn9", { question: q, requestId });
    logger.info("[live] qna", { liveStreamId });
    return res.json({ ok: true, question: q });
  } catch (err: any) {
    logger.error("[live] qna error", { err: err?.message });
    return res.status(500).json({ ok: false, message: "live_qna_failed" });
  }
}

const pollSchema = z.object({
  liveStreamId: z.string(),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  channelId: z.string().optional(),
  botToken: z.string().optional(),
  tenant: z.string().optional(),
});

export async function handleLivePoll(req: any, res: any) {
  const parsed = pollSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "invalid_body", issues: parsed.error.flatten() });
  }
  const { liveStreamId, question, options, channelId, botToken, tenant } = parsed.data;
  const requestId = getRequestId();
  const logger = createRequestLogger(requestId);
  try {
    const poll = await prisma.livePoll.create({
      data: {
        liveStreamId,
        question,
        options,
        results: {},
      },
    });
    if (botToken && channelId) {
      await sendTelegramPoll(botToken, channelId, question, options);
    }
    emit("live:poll:new", tenant ?? "bn9", { poll, requestId });
    logger.info("[live] poll", { liveStreamId });
    return res.json({ ok: true, poll });
  } catch (err: any) {
    logger.error("[live] poll error", { err: err?.message });
    return res.status(500).json({ ok: false, message: "live_poll_failed" });
  }
}

router.post("/live/start", authGuard, handleLiveStart);
router.post("/live/qna", authGuard, handleLiveQna);
router.post("/live/poll", authGuard, handleLivePoll);

router.get("/live/summary", authGuard, async (_req, res) => {
  try {
    const streams = await prisma.liveStream.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        questions: true,
        polls: true,
      },
      take: 5,
    });
    return res.json({ ok: true, streams });
  } catch (err: any) {
    const logger = createRequestLogger();
    logger.error("[live] summary error", { err: err?.message });
    return res.status(500).json({ ok: false, message: "live_summary_failed" });
  }
});

export { router as telegramLiveAdminRouter };
