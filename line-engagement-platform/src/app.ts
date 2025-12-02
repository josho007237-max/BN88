 codex/analyze-bn88-project-structure-and-workflow-s9ghbu
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { router as botRouter } from './routes/bot.routes';
import { router as groupRouter } from './routes/group.routes';
import { router as campaignRouter } from './routes/campaign.routes';
import { router as campaignsRouter } from './routes/campaigns.routes';
import { router as analyticsRouter } from './routes/analytics.routes';
import { router as liffRouter } from './routes/liff.routes';
import { router as paymentsRouter } from './routes/payments.routes';
import { router as webhookRouter } from './routes/webhook.routes';
import { errorHandler } from './middleware/error';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { messageQueue } from './queues/message.queue';
import { campaignQueue } from './queues/campaign.queue';
import { basicAuthMiddleware } from './middleware/basicAuth';

import express, { Request, Response } from "express";
import cors from "cors";

import { errorHandler } from "./middleware/error";
import { basicAuthMiddleware } from "./middleware/basicAuth";
import { messageQueue } from "./queues/message.queue";

import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { createBullBoard } from "@bull-board/api";
 main

export const createApp = () => {
  const app = express();

codex/analyze-bn88-project-structure-and-workflow-s9ghbu
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/bot', botRouter);
  app.use('/group', groupRouter);
  app.use('/campaign', campaignRouter);
  app.use('/campaigns', campaignsRouter);
  app.use('/analytics', analyticsRouter);
  app.use('/liff', liffRouter);
  app.use('/payments', paymentsRouter);
  app.use('/webhook', webhookRouter);

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(messageQueue), new BullMQAdapter(campaignQueue)],
    serverAdapter,
  });
  app.use('/admin/queues', basicAuthMiddleware, serverAdapter.getRouter());

  // 기본 미들웨어
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "line-engagement-platform" });
  });

  // TODO: ภายหลังค่อยมาใช้ router จริง ๆ
  // ตัวอย่าง (ยังไม่บังคับใช้):
  // const webhookRoutes = require("./routes/webhook.routes") as any;
  // app.use("/webhook/line", webhookRoutes.router ?? webhookRoutes.default ?? webhookRoutes);

  /* ------------------------------------------------------------------ */
  /* Bull Board                                                          */
  /* ------------------------------------------------------------------ */

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    // cast เป็น any เพื่อกัน TypeScript งอแงเรื่อง type ของ Job
    queues: [new BullMQAdapter(messageQueue as any) as any],
    serverAdapter,
  });

  app.use(
    "/admin/queues",
    basicAuthMiddleware,
    serverAdapter.getRouter() as any
  );

  /* ------------------------------------------------------------------ */
  /* Error handler                                                       */
  /* ------------------------------------------------------------------ */
 main

  app.use(errorHandler);

  return app;
};
