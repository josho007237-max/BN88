// src/queues/message.queue.ts
// Lightweight in-memory follow-up scheduler (no external queue dependency)

import { createRequestLogger } from "../utils/logger";

export type FollowUpJob<TPayload> = {
  id: string; // idempotency key
  delayMs: number;
  payload: TPayload;
  handler: (payload: TPayload) => Promise<void>;
  requestId?: string;
};

const timers = new Map<string, NodeJS.Timeout>();

export async function enqueueFollowUpJob<TPayload>(job: FollowUpJob<TPayload>) {
  const log = createRequestLogger(job.requestId);

  if (timers.has(job.id)) {
    log.info("[follow-up] already scheduled", { id: job.id });
    return job.id;
  }

  const timer = setTimeout(async () => {
    timers.delete(job.id);
    try {
      await job.handler(job.payload);
    } catch (err) {
      log.error("[follow-up] execution error", err);
    }
  }, Math.max(0, job.delayMs));

  timers.set(job.id, timer);
  log.info("[follow-up] scheduled", { id: job.id, delayMs: job.delayMs });
  return job.id;
}

export async function flushFollowUps() {
  for (const [id, timer] of timers.entries()) {
    clearTimeout(timer);
    timers.delete(id);
  }
}
