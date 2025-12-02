// src/queues/campaign.queue.ts

// @ts-nocheck

import { Queue } from "bullmq";
// ... โค้ดเดิมของคุณต่อด้านล่าง

import { env } from "../config/env";
import { prisma } from "../lib/prisma";

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

export const CAMPAIGN_QUEUE_NAME = "campaigns";

export type CampaignJobPayload = {
  campaignId: string;
  scheduleId?: string | null;
  // เพิ่ม field อื่นที่ worker ใช้ได้ตามจริง เช่น segmentId, channel ฯลฯ
};

export const campaignQueue = new Queue<CampaignJobPayload>(
  CAMPAIGN_QUEUE_NAME,
  { connection }
);

// ให้ BullMQ จัดการ repeatable jobs / stalled jobs
export const campaignQueueScheduler = new QueueScheduler(
  CAMPAIGN_QUEUE_NAME,
  { connection }
);

/**
 * enqueue แคมเปญแบบครั้งเดียว (ไม่ใช่ schedule)
 */
export async function enqueueCampaignOnce(
  payload: CampaignJobPayload,
  opts?: { idempotencyKey?: string }
) {
  const jobOptions: JobsOptions = {};

  if (opts?.idempotencyKey) {
    jobOptions.jobId = opts.idempotencyKey;
  }

  await campaignQueue.add("campaign.send", payload, jobOptions);
}

/**
 * สร้าง/อัปเดต repeatable job จาก CampaignSchedule
 * - ใช้ cronExpression + timezone จากตาราง CampaignSchedule
 * - ใช้ idempotencyKey เป็น jobId เพื่อให้ idempotent
 */
export async function upsertCampaignScheduleJob(scheduleId: string) {
  const schedule = await prisma.campaignSchedule.findUnique({
    where: { id: scheduleId },
    include: { campaign: true },
  });

  if (!schedule) {
    throw new Error(`CampaignSchedule not found: ${scheduleId}`);
  }

  if (!schedule.isActive) {
    await removeCampaignScheduleJob(schedule.idempotencyKey);
    return;
  }

  // ลบ job เดิมก่อน (กันกรณีแก้ cron/tz)
  await removeCampaignScheduleJob(schedule.idempotencyKey);

  const payload: CampaignJobPayload = {
    campaignId: schedule.campaignId,
    scheduleId: schedule.id,
  };

  await campaignQueue.add("campaign.send", payload, {
    jobId: schedule.idempotencyKey, // idempotency
    repeat: {
      cron: schedule.cronExpression,
      tz: schedule.timezone,
    },
  });
}

/**
 * ลบ repeatable job ตาม idempotencyKey
 */
export async function removeCampaignScheduleJob(idempotencyKey: string) {
  const repeatJobs = await campaignQueue.getRepeatableJobs();

  for (const r of repeatJobs) {
    if (r.id === idempotencyKey) {
      await campaignQueue.removeRepeatableByKey(r.key);
    }
  }
}
