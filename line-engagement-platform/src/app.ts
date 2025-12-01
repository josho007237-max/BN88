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

export const createApp = () => {
  const app = express();

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

  app.use(errorHandler);

  return app;
};
