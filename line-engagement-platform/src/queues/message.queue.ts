// src/queues/message.queue.ts
import { Queue, JobsOptions } from "bullmq";
import { env } from "../config/env";

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

export type MessageJobPayload = {
  to: string;
  messages: any[];
  campaignId?: string;
  audienceId?: string;
  attempts?: number;
};

export const messageQueue = new Queue<MessageJobPayload>("messages", {
  connection,
});

/**
 * enqueue งานส่งข้อความจริง
 * - รองรับ opts.idempotencyKey → map ไปที่ jobId (กันซ้ำ)
 */
export const enqueueMessage = async (
  payload: MessageJobPayload,
  opts?: { idempotencyKey?: string }
) => {
  const jobOptions: JobsOptions = {
    attempts: payload.attempts ?? 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  };

  if (opts?.idempotencyKey) {
    jobOptions.jobId = opts.idempotencyKey;
  }

  return messageQueue.add("send", payload, jobOptions);
};
