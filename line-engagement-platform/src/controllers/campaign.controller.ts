import { Request, Response } from 'express';
import { AudienceRepo } from '../repositories/audience.repo';
import { CampaignRepo } from '../repositories/campaign.repo';
import { getLoginUrl, exchangeToken, getProfile } from '../services/lineLogin.service';
import { enqueueMessage } from '../queues/message.queue';
import { log } from '../utils/logger';

export const listAudience = async (_req: Request, res: Response) => {
  const users = await AudienceRepo.list();
  res.json({ users });
};

export const scheduleCampaign = async (req: Request, res: Response) => {
  const { campaign } = req.body as any;

  const created = await CampaignRepo.create({
    name: campaign.name,
    scheduleStart: campaign.schedule?.startAt,
    scheduleEnd: campaign.schedule?.endAt,
    cron: campaign.schedule?.cron,
    enabled: campaign.enabled,
    segmentType: campaign.segment.type,
    segmentQuery: campaign.segment,
    message: campaign.message,
  });

  let targets: { id: string; lineUserId: string }[] = [];

  if (campaign.segment.type === 'tag') {
    const byTags = await AudienceRepo.findByTags(campaign.segment.tags);
    targets = byTags.map(u => ({ id: u.id, lineUserId: u.lineUserId }));
  } else {
    const all = await AudienceRepo.list();
    targets = all.map(u => ({ id: u.id, lineUserId: u.lineUserId }));
  }

  res.json({ ok: true, campaignId: created.id, sentTo: targets.length });
};

export const enqueueCampaign = async (req: Request, res: Response) => {
  try {
    const { campaign } = req.body as any;
    if (!campaign || !campaign.name || !campaign.message || !campaign.segment) {
      return res
        .status(400)
        .json({ error: 'Missing campaign.name or campaign.message or campaign.segment' });
    }

    const created = await CampaignRepo.create({
      name: campaign.name,
      scheduleStart: campaign.schedule?.startAt,
      scheduleEnd: campaign.schedule?.endAt,
      cron: campaign.schedule?.cron,
      enabled: campaign.enabled ?? true,
      segmentType: campaign.segment.type,
      segmentQuery: campaign.segment,
      message: campaign.message,
    });

    let targets: any[] = [];
    if (campaign.segment.type === 'tag' && Array.isArray(campaign.segment.tags)) {
      targets = await AudienceRepo.findByTags(campaign.segment.tags);
    } else {
      targets = await AudienceRepo.list();
    }

    let queued = 0;
    for (const t of targets) {
      await enqueueMessage({
        to: t.lineUserId,
        messages: [campaign.message],
        campaignId: created.id,
        audienceId: t.id,
      });
      queued++;
    }

    log(`Enqueued ${queued} jobs for campaign ${created.id}`);
    return res.json({ ok: true, campaignId: created.id, queued });
  } catch (err: any) {
    console.error('enqueueCampaign error', err);
    return res.status(500).json({ error: err?.message || 'internal error' });
  }
};

export const loginStart = async (_req: Request, res: Response) => {
  const url = getLoginUrl('state123');
  res.json({ url });
};

export const loginCallback = async (req: Request, res: Response) => {
  const { code } = req.query as any;
  const token = await exchangeToken(code);
  const profile = await getProfile(token.access_token);
  await AudienceRepo.upsertByLineUser(profile.userId, {
    displayName: profile.displayName,
    lastActiveAt: new Date(),
    tags: ['logged_in'],
  });
  res.json({ ok: true, profile });
};
