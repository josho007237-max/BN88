// src/routes/admin/bots.ts
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { Bot } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { z } from "zod";
import { sseHub } from "../../lib/sseHub";
import { requirePermission } from "../../middleware/basicAuth";

/* -------------------------------------------------------------------------- */
/*                          AI Model & Config defaults                        */
/* -------------------------------------------------------------------------- */

const ALLOWED_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "o4-mini",
  "gpt-3.5-turbo",
] as const;
type AllowedModel = (typeof ALLOWED_MODELS)[number];

const defaultBotConfigFields = {
  model: "gpt-4o-mini" as AllowedModel,
  systemPrompt: "",
  temperature: 0.3,
  topP: 1,
  maxTokens: 800,
};

const configUpdateSchema = z.object({
  model: z.enum(ALLOWED_MODELS).optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(1).max(32000).optional(),
});

/* -------------------------------------------------------------------------- */

const router = Router();

type RequestWithBot = Request & { bot?: Bot };

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

async function findBot(
  req: RequestWithBot,
  res: Response,
  next: NextFunction
) {
  const botId = (req.params.id ?? req.params.botId) as string | undefined;
  if (!botId || typeof botId !== "string") {
    return res.status(400).json({ ok: false, message: "missing_botId" });
  }

  try {
    const bot = await prisma.bot.findUnique({ where: { id: botId } });
    if (!bot) {
      return res.status(404).json({ ok: false, message: "bot_not_found" });
    }
    req.bot = bot;
    return next();
  } catch (err) {
    console.error("[findBot] error:", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
}

/* -------------------------------------------------------------------------- */
/*                             /api/admin/bots/*                              */
/* -------------------------------------------------------------------------- */

// GET /api/admin/bots
router.get("/", requirePermission(["manageBots"]), async (_req: Request, res: Response) => {
  try {
    const items = await prisma.bot.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tenant: true,
        name: true,
        platform: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        verifiedAt: true,
      },
    });
    return res.json({ ok: true, items });
  } catch (err) {
    console.error("GET /admin/bots error:", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

// GET /api/admin/bots/:id
router.get("/:id", requirePermission(["manageBots"]), findBot, (req: Request, res: Response) => {
  return res.json({ ok: true, bot: (req as RequestWithBot).bot as Bot });
});

// PATCH /api/admin/bots/:id
router.patch(
  "/:id",
  requirePermission(["manageBots"]),
  findBot,
  async (req: Request, res: Response): Promise<any> => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(100).optional(),
        active: z.boolean().optional(),
        verifiedAt: z.string().datetime().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          message: "invalid_input",
          issues: parsed.error.issues,
        });
      }

      const before = (req as RequestWithBot).bot as Bot;
      const updated = await prisma.bot.update({
        where: { id: req.params.id },
        data: parsed.data,
        select: {
          id: true,
          tenant: true,
          name: true,
          platform: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          verifiedAt: true,
        },
      });

      if (!before.verifiedAt && updated.verifiedAt) {
        sseHub.broadcast({
          type: "bot:verified",
          tenant: updated.tenant,
          botId: updated.id,
          at: new Date().toISOString(),
        });
      }

      return res.json({ ok: true, bot: updated });
    } catch (err) {
      console.error("PATCH /admin/bots/:id error:", err);
      return res.status(500).json({ ok: false, message: "internal_error" });
    }
  }
);

// POST /api/admin/bots/init
router.post("/init", requirePermission(["manageBots"]), async (_req: Request, res: Response) => {
  try {
    const TENANT = "bn9";
    const NAME = "admin-bot-001";

    const existed = await prisma.bot.findFirst({
      where: { tenant: TENANT, name: NAME },
      select: {
        id: true,
        tenant: true,
        name: true,
        platform: true,
        active: true,
        createdAt: true,
      },
    });
    if (existed) return res.json({ ok: true, bot: existed });

    const bot = await prisma.bot.create({
      data: { tenant: TENANT, name: NAME, platform: "line", active: true },
      select: {
        id: true,
        tenant: true,
        name: true,
        platform: true,
        active: true,
        createdAt: true,
      },
    });

    return res.json({ ok: true, bot });
  } catch (e: any) {
    if ((e as any)?.code === "P2002") {
      const bot = await prisma.bot.findFirst({
        where: { tenant: "bn9", name: "admin-bot-001" },
        select: {
          id: true,
          tenant: true,
          name: true,
          platform: true,
          active: true,
          createdAt: true,
        },
      });
      if (bot) return res.json({ ok: true, bot });
    }

    console.error("POST /admin/bots/init error:", e);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

/* -------------------------------------------------------------------------- */
/*                                   Secrets                                  */
/* -------------------------------------------------------------------------- */

const MASK = "********";

const secretsSchema = z
  .object({
    openaiApiKey: z.string().min(1).max(200).trim().optional(),
    openAiApiKey: z.string().min(1).max(200).trim().optional(), // alias casing
    lineAccessToken: z.string().min(1).max(500).trim().optional(),
    lineChannelSecret: z.string().min(1).max(200).trim().optional(),

    // backwards-compatible aliases
    openaiKey: z.string().min(1).max(200).trim().optional(),
    lineSecret: z.string().min(1).max(200).trim().optional(),
  })
  .refine(
    (v) =>
      Boolean(
        v.openaiApiKey ||
          v.openAiApiKey ||
          v.openaiKey ||
          v.lineAccessToken ||
          v.lineChannelSecret ||
          v.lineSecret
      ),
    {
      message: "at_least_one_field_required",
    }
  );

// GET /api/admin/bots/:id/secrets
router.get("/:id/secrets", findBot, async (req: Request, res: Response) => {
  try {
    const botId = req.params.id;
    const sec = await prisma.botSecret.findUnique({ where: { botId } });

    return res.json({
      ok: true,
      lineAccessToken: sec?.channelAccessToken ? MASK : "",
      lineChannelSecret: sec?.channelSecret ? MASK : "",
      openaiApiKey: sec?.openaiApiKey ? MASK : "",
    });
  } catch (err) {
    console.error("GET /admin/bots/:id/secrets error:", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

// POST /api/admin/bots/:id/secrets
router.post("/:id/secrets", findBot, async (req: Request, res: Response) => {
  try {
    const parsed = secretsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "invalid_input",
        issues: parsed.error.issues,
      });
    }

    const { bot } = req as RequestWithBot;
    if (!bot) {
      return res.status(404).json({ ok: false, message: "bot_not_found" });
    }

    const payload = parsed.data;
    const botId = bot.id;

    const norm = {
      openaiApiKey:
        payload.openaiApiKey ?? payload.openAiApiKey ?? payload.openaiKey,
      lineAccessToken: payload.lineAccessToken,
      lineChannelSecret: payload.lineChannelSecret ?? payload.lineSecret,
    };

    const update: {
      openaiApiKey?: string | null;
      channelAccessToken?: string | null;
      channelSecret?: string | null;
    } = {};

    if (norm.openaiApiKey) update.openaiApiKey = norm.openaiApiKey;
    if (norm.lineAccessToken) update.channelAccessToken = norm.lineAccessToken;
    if (norm.lineChannelSecret) update.channelSecret = norm.lineChannelSecret;

    const secretRow = await prisma.botSecret.upsert({
      where: { botId },
      update,
      create: {
        bot: { connect: { id: botId } },
        openaiApiKey: norm.openaiApiKey ?? null,
        channelAccessToken: norm.lineAccessToken ?? null,
        channelSecret: norm.lineChannelSecret ?? null,
      },
      select: {
        channelAccessToken: true,
        channelSecret: true,
        openaiApiKey: true,
      },
    });

    const hasLine =
      Boolean(secretRow.channelAccessToken) &&
      Boolean(secretRow.channelSecret);
    if (hasLine) {
      const updated = await prisma.bot.update({
        where: { id: botId },
        data: { verifiedAt: new Date() },
        select: { id: true, tenant: true },
      });

      sseHub.broadcast({
        type: "bot:verified",
        tenant: updated.tenant,
        botId: updated.id,
        at: new Date().toISOString(),
      });
    }

    return res.json({
      ok: true,
      botId,
      saved: {
        openaiApiKey: Boolean(secretRow.openaiApiKey),
        lineAccessToken: Boolean(secretRow.channelAccessToken),
        lineChannelSecret: Boolean(secretRow.channelSecret),
      },
    });
  } catch (err) {
    console.error("POST /admin/bots/:id/secrets error:", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

/* -------------------------------------------------------------------------- */
/*                             Bot Config (AI per bot)                        */
/* -------------------------------------------------------------------------- */

async function handleGetConfig(req: RequestWithBot, res: Response) {
  try {
    const { bot } = req;
    if (!bot) {
      return res.status(404).json({ ok: false, message: "bot_not_found" });
    }

    let cfg = await prisma.botConfig.findFirst({
      where: { botId: bot.id },
    });

    if (!cfg) {
      cfg = await prisma.botConfig.create({
        data: {
          ...defaultBotConfigFields,
          tenant: bot.tenant ?? "bn9",
          bot: { connect: { id: bot.id } },
        },
      });
    }

    return res.json({
      ok: true,
      config: {
        botId: bot.id,
        model: cfg.model,
        systemPrompt: cfg.systemPrompt,
        temperature: cfg.temperature,
        topP: cfg.topP,
        maxTokens: cfg.maxTokens,
      },
      allowedModels: ALLOWED_MODELS,
    });
  } catch (err) {
    console.error("GET /admin/bots/:botId/config error:", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
}

async function handlePutConfig(req: RequestWithBot, res: Response) {
  try {
    const { bot } = req;
    if (!bot) {
      return res.status(404).json({ ok: false, message: "bot_not_found" });
    }

    const parsed = configUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: "invalid_input",
        issues: parsed.error.issues,
      });
    }
    const updateData = parsed.data;

    const updatedConfig = await prisma.botConfig.upsert({
      where: { botId: bot.id },
      update: updateData,
      create: {
        ...defaultBotConfigFields,
        ...updateData,
        tenant: bot.tenant ?? "bn9",
        bot: { connect: { id: bot.id } },
      },
    });

    return res.json({
      ok: true,
      config: {
        botId: bot.id,
        model: updatedConfig.model,
        systemPrompt: updatedConfig.systemPrompt,
        temperature: updatedConfig.temperature,
        topP: updatedConfig.topP,
        maxTokens: updatedConfig.maxTokens,
      },
      allowedModels: ALLOWED_MODELS,
    });
  } catch (err) {
    console.error("PUT /admin/bots/:botId/config error:", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
}

// รองรับทั้งสองรูปแบบ path
router.get("/:botId/config", findBot, handleGetConfig);
router.get("/config/:botId", findBot, handleGetConfig);

router.put("/:botId/config", findBot, handlePutConfig);
router.put("/config/:botId", findBot, handlePutConfig);

export default router;
