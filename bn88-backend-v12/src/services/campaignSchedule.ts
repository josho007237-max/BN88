import { prisma } from "../lib/prisma";
import { createRequestLogger } from "../utils/logger";
import { upsertCampaignScheduleJob, removeCampaignScheduleJob } from "../queues/campaign.queue";

export async function listSchedules(campaignId: string) {
  return prisma.campaignSchedule.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSchedule(
  campaignId: string,
  data: {
    cron: string;
    timezone: string;
    startAt?: string;
    endAt?: string;
    idempotencyKey?: string;
    requestId?: string;
  },
) {
  const log = createRequestLogger(data.requestId);
  const schedule = await prisma.campaignSchedule.create({
    data: {
      campaignId,
      cronExpr: data.cron,
      timezone: data.timezone,
      startAt: data.startAt ? new Date(data.startAt) : undefined,
      endAt: data.endAt ? new Date(data.endAt) : undefined,
      idempotencyKey: data.idempotencyKey,
    },
  });

  await upsertCampaignScheduleJob({
    scheduleId: schedule.id,
    campaignId: schedule.campaignId,
    cron: schedule.cronExpr,
    timezone: schedule.timezone,
    startAt: schedule.startAt || undefined,
    endAt: schedule.endAt || undefined,
    idempotencyKey: schedule.idempotencyKey || undefined,
    requestId: data.requestId,
  });

  log.info("[campaign.schedule] created", { scheduleId: schedule.id, campaignId });
  return schedule;
}

export async function updateSchedule(
  campaignId: string,
  scheduleId: string,
  data: Partial<{ cron: string; timezone: string; startAt?: string | null; endAt?: string | null; idempotencyKey?: string }>,
  requestId?: string,
) {
  const log = createRequestLogger(requestId);
  const schedule = await prisma.campaignSchedule.update({
    where: { id: scheduleId },
    data: {
      cronExpr: data.cron,
      timezone: data.timezone,
      startAt: data.startAt === null ? null : data.startAt ? new Date(data.startAt) : undefined,
      endAt: data.endAt === null ? null : data.endAt ? new Date(data.endAt) : undefined,
      idempotencyKey: data.idempotencyKey,
    },
  });

  await removeCampaignScheduleJob(scheduleId);
  await upsertCampaignScheduleJob({
    scheduleId: schedule.id,
    campaignId: schedule.campaignId,
    cron: schedule.cronExpr,
    timezone: schedule.timezone,
    startAt: schedule.startAt || undefined,
    endAt: schedule.endAt || undefined,
    idempotencyKey: schedule.idempotencyKey || undefined,
    requestId,
  });

  log.info("[campaign.schedule] updated", { scheduleId, campaignId });
  return schedule;
}

export async function deleteSchedule(campaignId: string, scheduleId: string, requestId?: string) {
  const log = createRequestLogger(requestId);
  await removeCampaignScheduleJob(scheduleId);
  await prisma.campaignSchedule.delete({ where: { id: scheduleId } });
  log.info("[campaign.schedule] deleted", { scheduleId, campaignId });
  return { ok: true };
}
