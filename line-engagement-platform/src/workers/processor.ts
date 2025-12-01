import { Worker } from 'bullmq';
import { LineMessaging } from '../services/lineMessaging.service';
import { CampaignRepo } from '../repositories/campaign.repo';
import { env } from '../config/env';
import { log } from '../utils/logger';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

export const startMessageProcessor = () => {
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
    log('Message job completed', { id: job.id });
  });

  worker.on('failed', (job, err) => {
    console.error('Message job failed', job?.id, err?.message || err);
  });

  return worker;
};

export const startCampaignProcessor = () => {
  const worker = new Worker(
    'line-campaign',
    async job => {
      const { campaignId } = job.data as { campaignId: string };
      const campaign = await CampaignRepo.get(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      try {
        await CampaignRepo.setStatus(campaignId, 'running');
        const totalTargets = campaign.totalTargets ?? 1;

        // Simulate work by incrementing counts.
        await CampaignRepo.incrementCounts(campaignId, totalTargets, 0);

        await CampaignRepo.setStatus(campaignId, 'completed');
        log('Campaign completed', { campaignId, totalTargets });
        return { ok: true };
      } catch (err: any) {
        await CampaignRepo.incrementCounts(campaignId, 0, 1);
        await CampaignRepo.setStatus(campaignId, 'failed');
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
    log('Campaign job completed', { id: job.id });
  });

  worker.on('failed', (job, err) => {
    console.error('Campaign job failed', job?.id, err?.message || err);
  });

  return worker;
};

export const startAllProcessors = () => {
  const messageWorker = startMessageProcessor();
  const campaignWorker = startCampaignProcessor();

  return [messageWorker, campaignWorker];
};
