// src/routes/admin.ts
import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const router = Router();

/** GET /api/admin/bots */
router.get("/bots", async (_req: Request, res: Response) => {
  try {
    const items = await prisma.bot.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, tenant: true, name: true, platform: true,
        active: true, verifiedAt: true, createdAt: true, updatedAt: true,
      },
    });
    res.json({ ok: true, items });
  } catch (err) {
    console.error("GET /api/admin/bots error:", err);
    res.status(500).json({ ok: false, message: "internal_error" });
  }
});

/** POST /api/admin/bots/init */
router.post("/bots/init", async (_req: Request, res: Response) => {
  const tenant = "bn9";
  const name = "admin-bot-001";
  try {
    const existed = await prisma.bot.findFirst({ where: { tenant, name } });
    if (existed) return res.json({ ok: true, bot: existed });

    const bot = await prisma.bot.create({ data: { tenant, name, active: true } });
    res.json({ ok: true, bot });
  } catch (e: any) {
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
      const bot = await prisma.bot.findFirst({ where: { tenant, name } });
      if (bot) return res.json({ ok: true, bot });
    }
    console.error("POST /api/admin/bots/init error:", e);
    res.status(500).json({ ok: false, message: "create_failed" });
  }
});

/** PATCH /api/admin/bots/:id */
router.patch("/bots/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  const body = req.body ?? {};
  const data: Prisma.BotUpdateInput = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 60);
  if (typeof body.active === "boolean") data.active = body.active;

  try {
    const bot = await prisma.bot.update({ where: { id }, data });
    res.json({ ok: true, bot });
  } catch (err) {
    console.error("PATCH /api/admin/bots/:id error:", err);
    res.status(404).json({ ok: false, message: "not_found" });
  }
});

/** DELETE /api/admin/bots/:id */
router.delete("/bots/:id", async (req: Request, res: Response) => {
  try {
    await prisma.bot.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/bots/:id error:", err);
    res.status(404).json({ ok: false, message: "not_found" });
  }
});

/** GET /api/admin/bots/:id/secrets */
router.get("/bots/:id/secrets", async (req: Request, res: Response) => {
  const botId = req.params.id;
  const sec = await prisma.botSecret.findUnique({ where: { botId } });
  res.json({
    ok: true,
    openaiApiKey: sec?.openaiApiKey ? "********" : "",
    lineAccessToken: sec?.channelAccessToken ? "********" : "",
    lineChannelSecret: sec?.channelSecret ? "********" : "",
  });
});

/** POST /api/admin/bots/:id/secrets */
router.post("/bots/:id/secrets", async (req: Request, res: Response) => {
  const botId = req.params.id;
  const { openaiApiKey, lineAccessToken, lineChannelSecret } = (req.body ?? {}) as {
    openaiApiKey?: string | null;
    lineAccessToken?: string | null;
    lineChannelSecret?: string | null;
  };

  const data: Prisma.BotSecretUpdateInput = {};
  if (openaiApiKey?.trim()) data.openaiApiKey = openaiApiKey.trim();
  if (lineAccessToken?.trim()) data.channelAccessToken = lineAccessToken.trim();
  if (lineChannelSecret?.trim()) data.channelSecret = lineChannelSecret.trim();

  const existing = await prisma.botSecret.findUnique({ where: { botId } });
  if (existing) {
    if (Object.keys(data).length > 0)
      await prisma.botSecret.update({ where: { botId }, data });
  } else {
    await prisma.botSecret.create({
      data: {
        bot: { connect: { id: botId } },
        openaiApiKey: (data as any).openaiApiKey ?? null,
        channelAccessToken: (data as any).channelAccessToken ?? null,
        channelSecret: (data as any).channelSecret ?? null,
      },
    });
  }
  res.json({ ok: true, botId });
});

export default router;


