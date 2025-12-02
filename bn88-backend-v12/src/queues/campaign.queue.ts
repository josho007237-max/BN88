import { Queue, Worker, JobsOptions } from "bullmq";
import { config } from "../config";
import { createRequestLogger } from "../utils/logger";
import { queueCampaign } from "../services/lepClient";

const connection = { url: config.REDIS_URL };
const queueName = "lep-campaign";

export type CampaignScheduleJob = {
  scheduleId: string;
  campaignId: string;
  requestId?: string;
};

let queueInstance: Queue<CampaignScheduleJob> | null = null;
let workerStarted = false;

function getQueue() {
  if (!queueInstance) {
    queueInstance = new Queue<CampaignScheduleJob>(queueName, { connection });
  }
  return queueInstance;
}

export async function upsertCampaignScheduleJob(
  job: CampaignScheduleJob & { cron: string; timezone: string; startAt?: Date; endAt?: Date; idempotencyKey?: string },
) {
  const q = getQueue();
  const log = createRequestLogger(job.requestId);

  const repeat: JobsOptions["repeat"] = {
    cron: job.cron,
    tz: job.timezone,
  };

  if (job.startAt) repeat.startDate = job.startAt.getTime();
  if (job.endAt) repeat.endDate = job.endAt.getTime();

  const jobId = job.idempotencyKey || job.scheduleId;

  await q.add("campaign.schedule", { scheduleId: job.scheduleId, campaignId: job.campaignId, requestId: job.requestId }, {
    jobId,
    repeat,
    removeOnComplete: true,
    removeOnFail: true,
  });

  log.info("[campaign.schedule] registered", { scheduleId: job.scheduleId, campaignId: job.campaignId, jobId });
  return jobId;
}

export async function removeCampaignScheduleJob(scheduleId: string) {
  const q = getQueue();
  const repeatables = await q.getRepeatableJobs();
  for (const r of repeatables) {
    if (r.id === scheduleId || r.key.includes(scheduleId)) {
      await q.removeRepeatableByKey(r.key);
    }
  }
}

export function startCampaignScheduleWorker() {
  if (workerStarted) return;
  workerStarted = true;

  const worker = new Worker<CampaignScheduleJob>(
    queueName,
    async (job) => {
      const log = createRequestLogger(job.data.requestId || job.id);
      log.info("[campaign.schedule] firing", { scheduleId: job.data.scheduleId, campaignId: job.data.campaignId });
      try {
        await queueCampaign(job.data.campaignId);
        log.info("[campaign.schedule] queued campaign", { campaignId: job.data.campaignId });
      } catch (err) {
        log.error("[campaign.schedule] queue failed", err);
        throw err;
      }
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    const log = createRequestLogger(job?.data?.requestId || job?.id);
    log.error("[campaign.schedule] worker failed", err);
  });
}
