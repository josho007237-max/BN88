import { Worker } from 'bullmq';
import { LineMessaging } from '../services/lineMessaging.service';
import { CampaignRepo } from '../repositories/campaign.repo';
import { env } from '../config/env';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

export const startProcessor = () => {
  const worker = new Worker(
    'messages',
    async job => {
      const { to, messages, campaignId, audienceId } = job.data as any;
      try {
        await LineMessaging.push(to, messages);
        if (campaignId && audienceId) {
          await CampaignRepo.recordDelivery(campaignId, audienceId, 'sent', new Date());
        }
        return { ok: true };
      } catch (err: any) {
        if (campaignId && audienceId) {
          await CampaignRepo.recordDelivery(
            campaignId,
            audienceId,
            'failed',
            undefined,
            err?.message,
          );
        }
        throw err;
      }
    },
    {
      connection,
      concurrency: env.WORKER.CONCURRENCY,
      limiter: {
        max: env.WORKER.RATE_MAX,
        duration: env.WORKER.RATE_DURATION_MS,
      },
    },
  );

  worker.on('completed', job => {
    console.log('Job completed', job.id);
  });

  worker.on('failed', (job, err) => {
    console.error('Job failed', job?.id, err?.message || err);
  });

  return worker;
};
