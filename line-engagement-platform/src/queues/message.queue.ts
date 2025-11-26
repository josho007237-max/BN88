import { Queue } from 'bullmq';
import { env } from '../config/env';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

export const messageQueue = new Queue('messages', { connection });

export const enqueueMessage = async (payload: {
  to: string;
  messages: any[];
  campaignId?: string;
  audienceId?: string;
  attempts?: number;
}) => {
  return messageQueue.add('send', payload, {
    attempts: payload.attempts ?? 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
};
