import { Queue, JobsOptions } from 'bullmq';
import { env } from '../config/env';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

export const messageQueue = new Queue('messages', { connection });

const baseOptions = (payload: { attempts?: number } = {}): JobsOptions => ({
  attempts: payload.attempts ?? 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 1000,
});

export const enqueueMessage = async (payload: {
  to: string;
  messages: any[];
  campaignId?: string;
  audienceId?: string;
  attempts?: number;
  idempotencyKey?: string;
}) => {
  return messageQueue.add('send', payload, {
    ...baseOptions(payload),
    jobId: payload.idempotencyKey,
  });
};

export const scheduleMessage = async (payload: {
  to: string;
  messages: any[];
  campaignId?: string;
  audienceId?: string;
  cron: string;
  timezone: string;
  idempotencyKey?: string;
}) => {
  return messageQueue.add('send', payload, {
    ...baseOptions(payload),
    jobId: payload.idempotencyKey,
    repeat: {
      pattern: payload.cron,
      tz: payload.timezone,
    },
  });
};
