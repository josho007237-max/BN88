import { Queue } from 'bullmq';
import { env } from '../config/env';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

export const campaignQueue = new Queue('line-campaign', { connection });

export const enqueueCampaignJob = async (
  campaignId: string,
  options?: { idempotencyKey?: string },
) => {
  return campaignQueue.add(
    'dispatch',
    { campaignId },
    {
      jobId: options?.idempotencyKey || `campaign:${campaignId}:once`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 500,
      removeOnFail: 500,
    },
  );
};

export const scheduleCampaignJob = async (params: {
  campaignId: string;
  scheduleId: string;
  cron: string;
  timezone: string;
  idempotencyKey?: string;
  startAt?: Date;
  endAt?: Date;
}) => {
  const job = await campaignQueue.add(
    'dispatch',
    { campaignId: params.campaignId, scheduleId: params.scheduleId },
    {
      jobId: params.idempotencyKey || `campaign:${params.campaignId}:schedule:${params.scheduleId}`,
      repeat: {
        pattern: params.cron,
        tz: params.timezone,
        startDate: params.startAt,
        endDate: params.endAt,
      },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  );

  return job;
};

export const removeScheduledCampaignJob = async (repeatJobKey?: string | null) => {
  if (!repeatJobKey) return;
  await campaignQueue.removeRepeatableByKey(repeatJobKey);
};
