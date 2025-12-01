import { prisma } from '../config/db';

export const CampaignRepo = {
  create: async (data: {
    name: string;
    scheduleStart?: string;
    scheduleEnd?: string;
    cron?: string;
    enabled?: boolean;
    segmentType?: string;
    segmentQuery?: any;
    message: any;
  }) =>
    prisma.campaign.create({
      data: {
        name: data.name,
        message: typeof data.message === 'string' ? data.message : JSON.stringify(data.message),
        messagePayload: data.message,
        scheduleStart: data.scheduleStart ? new Date(data.scheduleStart) : undefined,
        scheduleEnd: data.scheduleEnd ? new Date(data.scheduleEnd) : undefined,
        cron: data.cron,
        enabled: data.enabled ?? true,
        segmentType: data.segmentType,
        segmentQuery: data.segmentQuery,
      },
    }),

  createDraft: async (data: { name: string; message: string; totalTargets?: number }) =>
    prisma.campaign.create({
      data: {
        name: data.name,
        message: data.message,
        totalTargets: data.totalTargets,
        status: 'draft',
      },
    }),

  list: async () =>
    prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    }),

  listPaginated: async (page: number, pageSize: number) => {
    const [items, total] = await Promise.all([
      prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.campaign.count(),
    ]);

    return { items, total };
  },

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

  setStatus: async (id: string, status: string) =>
    prisma.campaign.update({
      where: { id },
      data: { status },
    }),

  incrementCounts: async (id: string, sentDelta: number, failedDelta: number) =>
    prisma.campaign.update({
      where: { id },
      data: {
        sentCount: { increment: sentDelta },
        failedCount: { increment: failedDelta },
      },
    }),

  listSchedules: async (campaignId: string) =>
    prisma.campaignSchedule.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    }),

  createSchedule: async (data: {
    campaignId: string;
    cron: string;
    timezone: string;
    startAt?: Date;
    endAt?: Date;
    idempotencyKey?: string;
    repeatJobKey?: string | null;
  }) =>
    prisma.campaignSchedule.create({
      data: {
        campaignId: data.campaignId,
        cron: data.cron,
        timezone: data.timezone,
        startAt: data.startAt,
        endAt: data.endAt,
        idempotencyKey: data.idempotencyKey,
        repeatJobKey: data.repeatJobKey ?? undefined,
      },
    }),

  updateSchedule: async (
    scheduleId: string,
    data: Partial<{
      cron: string;
      timezone: string;
      startAt?: Date | null;
      endAt?: Date | null;
      enabled?: boolean;
      repeatJobKey?: string | null;
      idempotencyKey?: string | null;
    }>,
  ) =>
    prisma.campaignSchedule.update({
      where: { id: scheduleId },
      data,
    }),

  deleteSchedule: async (scheduleId: string) =>
    prisma.campaignSchedule.delete({ where: { id: scheduleId } }),

  getSchedule: async (scheduleId: string) =>
    prisma.campaignSchedule.findUnique({ where: { id: scheduleId } }),
};
