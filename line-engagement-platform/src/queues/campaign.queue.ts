import { Queue } from 'bullmq';
import { env } from '../config/env';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

export const campaignQueue = new Queue('line-campaign', { connection });

export const enqueueCampaignJob = async (campaignId: string) => {
  return campaignQueue.add(
    'dispatch',
    { campaignId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 500,
      removeOnFail: 500,
    },
  );
};
