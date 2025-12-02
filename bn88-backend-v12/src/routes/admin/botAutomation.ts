import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { createRequestLogger } from "../../utils/logger";
import { scheduleEngagementMessage } from "../../services/engagementScheduler";

const router = Router();

const botIdQuery = z.object({ botId: z.string().min(1) });

const faqCreateSchema = z.object({
  botId: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
});

const faqUpdateSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
});

const engagementCreateSchema = z.object({
  botId: z.string().min(1),
  platform: z.string().min(1).default("line"),
  channelId: z.string().min(1),
  text: z.string().min(1),
  interval: z.number().int().positive(),
  enabled: z.boolean().optional(),
  type: z.string().optional(),
  meta: z.any().optional(),
});

const engagementUpdateSchema = engagementCreateSchema.partial().extend({
  botId: z.string().min(1).optional(),
});

export async function listFaq(botId: string) {
  return prisma.fAQ.findMany({ where: { botId }, orderBy: { createdAt: "asc" } });
}

export async function createFaq(data: z.infer<typeof faqCreateSchema>) {
  return prisma.fAQ.create({ data });
}

export async function updateFaq(id: string, data: z.infer<typeof faqUpdateSchema>) {
  return prisma.fAQ.update({ where: { id }, data });
}

export async function deleteFaq(id: string) {
  return prisma.fAQ.delete({ where: { id } });
}

router.get("/faq", async (req, res) => {
  const parsed = botIdQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "botId_required" });
  }
  const items = await listFaq(parsed.data.botId);
  return res.json({ ok: true, items });
});

router.post("/faq", async (req, res) => {
  const parsed = faqCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "invalid_body", issues: parsed.error.issues });
  }
  const faq = await createFaq(parsed.data);
  return res.status(201).json({ ok: true, item: faq });
});

router.put("/faq/:id", async (req, res) => {
  const id = req.params.id;
  const parsed = faqUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "invalid_body", issues: parsed.error.issues });
  }
  const existing = await prisma.fAQ.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ ok: false, message: "faq_not_found" });
  const faq = await updateFaq(id, parsed.data);
  return res.json({ ok: true, item: faq });
});

router.delete("/faq/:id", async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.fAQ.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ ok: false, message: "faq_not_found" });
  await deleteFaq(id);
  return res.json({ ok: true });
});

export async function listEngagement(botId: string) {
  return prisma.engagementMessage.findMany({
    where: { botId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createEngagement(data: z.infer<typeof engagementCreateSchema>) {
  const created = await prisma.engagementMessage.create({ data });
  await scheduleEngagementMessage(created).catch((err) => {
    createRequestLogger().warn("[engagement] schedule error", err);
  });
  return created;
}

export async function updateEngagement(id: string, data: z.infer<typeof engagementUpdateSchema>) {
  const updated = await prisma.engagementMessage.update({ where: { id }, data });
  await scheduleEngagementMessage(updated).catch((err) => {
    createRequestLogger().warn("[engagement] reschedule error", err);
  });
  return updated;
}

export async function deleteEngagement(id: string) {
  return prisma.engagementMessage.delete({ where: { id } });
}

router.get("/engagement", async (req, res) => {
  const parsed = botIdQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "botId_required" });
  }
  const { botId } = parsed.data;
  const items = await listEngagement(botId);
  return res.json({ ok: true, items });
});

router.post("/engagement", async (req, res) => {
  const bodyParsed = engagementCreateSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res
      .status(400)
      .json({ ok: false, message: "invalid_body", issues: bodyParsed.error.issues });
  }
  const data = { ...bodyParsed.data, enabled: bodyParsed.data.enabled ?? true };
  const created = await createEngagement(data);
  return res.status(201).json({ ok: true, item: created });
});

router.put("/engagement/:id", async (req, res) => {
  const id = req.params.id;
  const bodyParsed = engagementUpdateSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res
      .status(400)
      .json({ ok: false, message: "invalid_body", issues: bodyParsed.error.issues });
  }
  const existing = await prisma.engagementMessage.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ ok: false, message: "engagement_not_found" });
  const updated = await updateEngagement(id, bodyParsed.data);
  return res.json({ ok: true, item: updated });
});

router.delete("/engagement/:id", async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.engagementMessage.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ ok: false, message: "engagement_not_found" });
  await deleteEngagement(id);
  return res.json({ ok: true });
});

export default router;
