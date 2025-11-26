import { prisma } from '../config/db';

export const EventRepo = {
  record: async (
    type: string,
    payload: any,
    audienceId?: string,
    occurredAt?: Date,
  ) =>
    prisma.event.create({
      data: { type, payload, audienceId, occurredAt },
    }),

  stats: async () => {
    const total = await prisma.event.count();
    const byType = await prisma.event.groupBy({
      by: ['type'],
      _count: { type: true },
    });
    return { total, byType };
  },

  recent: async (limit = 100) =>
    prisma.event.findMany({
      orderBy: { occurredAt: 'desc' },
      take: limit,
    }),
};
