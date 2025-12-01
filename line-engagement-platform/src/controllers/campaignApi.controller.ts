import { Request, Response } from 'express';
import { CampaignRepo } from '../repositories/campaign.repo';
import {
  enqueueCampaignJob,
  removeScheduledCampaignJob,
  scheduleCampaignJob,
} from '../queues/campaign.queue';
import { log } from '../utils/logger';

const parsePagination = (req: Request) => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const pageSize = Math.max(1, Math.min(100, parseInt((req.query.pageSize as string) || '20', 10)));
  return { page, pageSize };
};

export const CampaignApiController = {
  create: async (req: Request, res: Response) => {
    const { name, message, targets } = req.body as { name?: string; message?: string; targets?: any };
    if (!name || !message) {
      return res.status(400).json({ error: 'name and message are required' });
    }

    const totalTargets = Array.isArray(targets) ? targets.length : undefined;

    const campaign = await CampaignRepo.createDraft({ name, message, totalTargets });
    return res.status(201).json(campaign);
  },

  list: async (req: Request, res: Response) => {
    const { page, pageSize } = parsePagination(req);
    const { items, total } = await CampaignRepo.listPaginated(page, pageSize);
    return res.json({ items, total, page, pageSize });
  },

  queue: async (req: Request, res: Response) => {
    const { id } = req.params;
    const existing = await CampaignRepo.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await CampaignRepo.setStatus(id, 'queued');
    const job = await enqueueCampaignJob(id);
    log('Queued campaign job', { campaignId: id, jobId: job.id });

    return res.json({ ok: true, campaignId: id, status: 'queued', jobId: job.id });
  },

  get: async (req: Request, res: Response) => {
    const { id } = req.params;
    const campaign = await CampaignRepo.get(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    return res.json(campaign);
  },

  status: async (req: Request, res: Response) => {
    const { id } = req.params;
    const campaign = await CampaignRepo.get(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    return res.json({
      id: campaign.id,
      status: campaign.status,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      totalTargets: campaign.totalTargets,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    });
  },

  listSchedules: async (req: Request, res: Response) => {
    const { id } = req.params;
    const campaign = await CampaignRepo.get(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const schedules = await CampaignRepo.listSchedules(id);
    return res.json({ campaignId: id, schedules });
  },

  createSchedule: async (req: Request, res: Response) => {
    const { id } = req.params;
    const campaign = await CampaignRepo.get(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const { cron, timezone, startAt, endAt, idempotencyKey } = req.body as any;
    if (!cron || !timezone) {
      return res.status(400).json({ error: 'cron and timezone are required' });
    }

    const schedule = await CampaignRepo.createSchedule({
      campaignId: id,
      cron,
      timezone,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
      idempotencyKey,
    });

    const job = await scheduleCampaignJob({
      campaignId: id,
      scheduleId: schedule.id,
      cron,
      timezone,
      idempotencyKey: idempotencyKey || schedule.id,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
    });

    const repeatJobKey = (job as any).repeatJobKey || job.opts.repeat?.key;
    if (repeatJobKey) {
      await CampaignRepo.updateSchedule(schedule.id, { repeatJobKey });
    }

    return res.status(201).json({
      ok: true,
      campaignId: id,
      schedule: { ...schedule, repeatJobKey },
      jobId: job.id,
      repeatJobKey,
    });
  },

  updateSchedule: async (req: Request, res: Response) => {
    const { id, scheduleId } = req.params as any;
    const campaign = await CampaignRepo.get(id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const existing = await CampaignRepo.getSchedule(scheduleId);
    if (!existing || existing.campaignId !== id) return res.status(404).json({ error: 'Schedule not found' });

    const { cron, timezone, startAt, endAt, enabled, idempotencyKey } = req.body as any;
    if (!cron || !timezone) {
      return res.status(400).json({ error: 'cron and timezone are required' });
    }

    if (existing.repeatJobKey) {
      await removeScheduledCampaignJob(existing.repeatJobKey);
    }

    const updated = await CampaignRepo.updateSchedule(scheduleId, {
      cron,
      timezone,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
      enabled: enabled ?? existing.enabled,
      idempotencyKey: idempotencyKey ?? existing.idempotencyKey,
      repeatJobKey: null,
    });

    const job = await scheduleCampaignJob({
      campaignId: id,
      scheduleId,
      cron,
      timezone,
      idempotencyKey: idempotencyKey || updated.id,
      startAt: startAt ? new Date(startAt) : undefined,
      endAt: endAt ? new Date(endAt) : undefined,
    });
    const repeatJobKey = (job as any).repeatJobKey || job.opts.repeat?.key;
    if (repeatJobKey) {
      await CampaignRepo.updateSchedule(scheduleId, { repeatJobKey });
    }

    return res.json({ ok: true, scheduleId, repeatJobKey, jobId: job.id });
  },

  deleteSchedule: async (req: Request, res: Response) => {
    const { id, scheduleId } = req.params;
    const campaign = await CampaignRepo.get(id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const existing = await CampaignRepo.getSchedule(scheduleId);
    if (!existing || existing.campaignId !== id) return res.status(404).json({ error: 'Schedule not found' });

    if (existing.repeatJobKey) {
      await removeScheduledCampaignJob(existing.repeatJobKey);
    }

    await CampaignRepo.deleteSchedule(scheduleId);
    return res.json({ ok: true, scheduleId });
  },
};
