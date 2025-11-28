import { Request, Response } from 'express';
import { EventRepo } from '../repositories/event.repo';
import { prisma } from '../config/db';

export const eventsFeed = async (_req: Request, res: Response) => {
  const last100 = await EventRepo.recent(100);
  const stats = await EventRepo.stats();
  const deliveries = await prisma.campaignDelivery.count({
    where: { status: 'sent' },
  });

  res.json({
    metrics: {
      totalEvents: stats.total,
      byType: stats.byType,
      deliveriesSent: deliveries,
    },
    last100,
  });
};
