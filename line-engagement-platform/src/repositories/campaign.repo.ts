import { prisma } from '../config/db';

export const CampaignRepo = {
  create: async (data: {
    name: string;
    scheduleStart?: string;
    scheduleEnd?: string;
    cron?: string;
    enabled?: boolean;
    segmentType: string;
    segmentQuery: any;
    message: any;
  }) =>
    prisma.campaign.create({
      data: {
        name: data.name,
        scheduleStart: data.scheduleStart ? new Date(data.scheduleStart) : undefined,
        scheduleEnd: data.scheduleEnd ? new Date(data.scheduleEnd) : undefined,
        cron: data.cron,
        enabled: data.enabled ?? true,
        segmentType: data.segmentType,
        segmentQuery: data.segmentQuery,
        message: data.message,
      },
    }),

  list: async () =>
    prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    }),

  get: async (id: string) =>
    prisma.campaign.findUnique({
      where: { id },
    }),

  recordDelivery: async (
    campaignId: string,
    audienceId: string,
    status: string,
    sentAt?: Date,
    error?: string,
  ) =>
    prisma.campaignDelivery.create({
      data: { campaignId, audienceId, status, sentAt, error },
    }),
};
