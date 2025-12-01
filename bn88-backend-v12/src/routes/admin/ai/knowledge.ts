// src/routes/admin/ai/knowledge.ts
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";

const r = Router();

/* --------------------------------- helpers -------------------------------- */

const tenantOf = (req: Request) =>
  (req.headers["x-tenant"] as string | undefined)?.trim() || "bn9";

const textOr = (v: unknown, d = "") => (typeof v === "string" ? v.trim() : d);

const pageNum = (v: unknown, def = 1, min = 1, max = 9999) => {
  const x = Number(textOr(v, ""));
  return Math.min(Math.max(Number.isFinite(x) ? x : def, min), max);
};

const limitNum = (v: unknown, def = 20, min = 1, max = 100) => {
  const x = Number(textOr(v, ""));
  return Math.min(Math.max(Number.isFinite(x) ? x : def, min), max);
};

const docSchema = z.object({
  title: z.string().min(1, "title_required"),
  tags: z.string().default(""),
  body: z.string().default(""),
  status: z.enum(["active", "draft", "archived"]).default("active"),
});

const docPartial = docSchema.partial();

const chunkSchema = z.object({
  content: z.string().min(1, "content_required"),
  embedding: z.any().optional(),
  tokens: z.number().int().nonnegative().default(0),
});

const chunkPartial = chunkSchema.partial();

const linkSchema = z.object({
  docId: z.string().min(1, "docId_required"),
});

async function ensureBotAndTenant(botId: string, tenant: string) {
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || bot.tenant !== tenant) return null;
  return bot;
}

async function ensureDocTenant(docId: string, tenant: string) {
  return prisma.knowledgeDoc.findFirst({ where: { id: docId, tenant } });
}

/* ----------------------------------- docs ---------------------------------- */

r.get("/docs", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const q = textOr(req.query.q);
    const status = textOr(req.query.status);
    const page = pageNum(req.query.page, 1);
    const limit = limitNum(req.query.limit, 20);
    const skip = (page - 1) * limit;

    const where: any = { tenant };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { body: { contains: q, mode: "insensitive" } },
        { tags: { contains: q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.knowledgeDoc.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: { _count: { select: { chunks: true, bots: true } } },
      }),
      prisma.knowledgeDoc.count({ where }),
    ]);

    return res.json({
      ok: true,
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[knowledge][docs:list]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

r.post("/docs", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const parsed = docSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, message: "invalid_input", issues: parsed.error.issues });
    }

    const item = await prisma.knowledgeDoc.create({
      data: { tenant, ...parsed.data },
    });

    return res.json({ ok: true, item });
  } catch (err) {
    console.error("[knowledge][docs:create]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

r.get("/docs/:id", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const item = await prisma.knowledgeDoc.findFirst({
      where: { id: req.params.id, tenant },
      include: {
        _count: { select: { chunks: true, bots: true } },
        bots: { include: { bot: true }, orderBy: { createdAt: "desc" } },
      },
    });

    if (!item) return res.status(404).json({ ok: false, message: "not_found" });

    return res.json({ ok: true, item });
  } catch (err) {
    console.error("[knowledge][docs:get]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

r.patch("/docs/:id", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const exists = await prisma.knowledgeDoc.findFirst({
      where: { id: req.params.id, tenant },
      select: { id: true },
    });
    if (!exists) return res.status(404).json({ ok: false, message: "not_found" });

    const parsed = docPartial.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, message: "invalid_input", issues: parsed.error.issues });
    }

    const item = await prisma.knowledgeDoc.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    return res.json({ ok: true, item });
  } catch (err) {
    console.error("[knowledge][docs:update]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

r.delete("/docs/:id", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const exists = await prisma.knowledgeDoc.findFirst({
      where: { id: req.params.id, tenant },
      select: { id: true },
    });
    if (!exists) return res.status(404).json({ ok: false, message: "not_found" });

    await prisma.knowledgeDoc.delete({ where: { id: req.params.id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[knowledge][docs:delete]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

/* ---------------------------------- chunks --------------------------------- */

r.get("/docs/:id/chunks", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const doc = await ensureDocTenant(req.params.id, tenant);
    if (!doc) return res.status(404).json({ ok: false, message: "doc_not_found" });

    const items = await prisma.knowledgeChunk.findMany({
      where: { docId: doc.id },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({ ok: true, items });
  } catch (err) {
    console.error("[knowledge][chunks:list]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

r.post("/docs/:id/chunks", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const doc = await ensureDocTenant(req.params.id, tenant);
    if (!doc) return res.status(404).json({ ok: false, message: "doc_not_found" });

    const parsed = chunkSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, message: "invalid_input", issues: parsed.error.issues });
    }

    const item = await prisma.knowledgeChunk.create({
      data: {
        tenant,
        docId: doc.id,
        content: parsed.data.content,
        embedding: parsed.data.embedding ?? [],
        tokens: parsed.data.tokens ?? 0,
      },
    });

    return res.json({ ok: true, item });
  } catch (err) {
    console.error("[knowledge][chunks:create]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

r.patch("/chunks/:chunkId", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const chunk = await prisma.knowledgeChunk.findUnique({
      where: { id: req.params.chunkId },
      include: { doc: true },
    });
    if (!chunk || chunk.doc.tenant !== tenant)
      return res.status(404).json({ ok: false, message: "chunk_not_found" });

    const parsed = chunkPartial.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, message: "invalid_input", issues: parsed.error.issues });
    }

    const item = await prisma.knowledgeChunk.update({
      where: { id: chunk.id },
      data: {
        ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
        ...(parsed.data.embedding !== undefined ? { embedding: parsed.data.embedding } : {}),
        ...(parsed.data.tokens !== undefined ? { tokens: parsed.data.tokens } : {}),
      },
    });

    return res.json({ ok: true, item });
  } catch (err) {
    console.error("[knowledge][chunks:update]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

r.delete("/chunks/:chunkId", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const chunk = await prisma.knowledgeChunk.findUnique({
      where: { id: req.params.chunkId },
      include: { doc: true },
    });
    if (!chunk || chunk.doc.tenant !== tenant)
      return res.status(404).json({ ok: false, message: "chunk_not_found" });

    await prisma.knowledgeChunk.delete({ where: { id: chunk.id } });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[knowledge][chunks:delete]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

/* ---------------------------- bot/doc relations ---------------------------- */

r.get("/bots/:botId/knowledge", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const bot = await ensureBotAndTenant(req.params.botId, tenant);
    if (!bot) return res.status(404).json({ ok: false, message: "bot_not_found" });

    const links = await prisma.botKnowledge.findMany({
      where: { botId: bot.id },
      include: {
        doc: {
          include: { _count: { select: { chunks: true, bots: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      ok: true,
      botId: bot.id,
      items: links.map((l) => l.doc),
      docIds: links.map((l) => l.docId),
    });
  } catch (err) {
    console.error("[knowledge][bot:list]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

r.post("/bots/:botId/knowledge", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const bot = await ensureBotAndTenant(req.params.botId, tenant);
    if (!bot) return res.status(404).json({ ok: false, message: "bot_not_found" });

    const parsed = linkSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ ok: false, message: "invalid_input", issues: parsed.error.issues });
    }

    const doc = await ensureDocTenant(parsed.data.docId, tenant);
    if (!doc) return res.status(404).json({ ok: false, message: "doc_not_found" });

    await prisma.botKnowledge.upsert({
      where: { botId_docId: { botId: bot.id, docId: doc.id } },
      update: {},
      create: { botId: bot.id, docId: doc.id },
    });

    return res.json({ ok: true, botId: bot.id, docId: doc.id });
  } catch (err) {
    console.error("[knowledge][bot:add]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

r.delete("/bots/:botId/knowledge/:docId", async (req: Request, res: Response) => {
  try {
    const tenant = tenantOf(req);
    const bot = await ensureBotAndTenant(req.params.botId, tenant);
    if (!bot) return res.status(404).json({ ok: false, message: "bot_not_found" });

    const doc = await ensureDocTenant(req.params.docId, tenant);
    if (!doc) return res.status(404).json({ ok: false, message: "doc_not_found" });

    await prisma.botKnowledge.deleteMany({
      where: { botId: bot.id, docId: doc.id },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("[knowledge][bot:remove]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
});

/* ---------------------------- legacy link helper --------------------------- */

r.get("/link/:botId", async (req: Request, res: Response) => {
  const tenant = tenantOf(req);
  const bot = await ensureBotAndTenant(req.params.botId, tenant);
  if (!bot) return res.status(404).json({ ok: false, message: "bot_not_found" });

  const links = await prisma.botKnowledge.findMany({
    where: { botId: bot.id },
    include: { doc: true },
    orderBy: { createdAt: "desc" },
  });

  return res.json({
    ok: true,
    botId: bot.id,
    docIds: links.map((l) => l.docId),
    items: links.map((l) => l.doc),
  });
});

r.post("/link/:botId", async (req: Request, res: Response) => {
  const tenant = tenantOf(req);
  const bot = await ensureBotAndTenant(req.params.botId, tenant);
  if (!bot) return res.status(404).json({ ok: false, message: "bot_not_found" });

  const docs = Array.isArray(req.body?.docIds) ? req.body.docIds : [];
  const validDocIds = docs.filter((d: unknown) => typeof d === "string" && d.trim());

  await prisma.$transaction([
    prisma.botKnowledge.deleteMany({ where: { botId: bot.id } }),
    ...validDocIds.map((docId: string) =>
      prisma.botKnowledge.upsert({
        where: { botId_docId: { botId: bot.id, docId } },
        update: {},
        create: { botId: bot.id, docId },
      })
    ),
  ]);

  return res.json({ ok: true, botId: bot.id, docIds: validDocIds });
});

export default r;
