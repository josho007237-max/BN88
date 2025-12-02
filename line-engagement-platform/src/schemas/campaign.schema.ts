export type AudienceSegment =
  | { type: 'profile'; fields: { locale?: string; displayNameContains?: string } }
  | { type: 'tag'; tags: string[] }
  | { type: 'behavior'; lastActiveDaysLTE?: number };

export type CampaignInput = {
  id?: string;
  name: string;
  schedule?: { startAt?: string; endAt?: string; cron?: string };
  segment: AudienceSegment;
  message: any;
  channels?: { line: boolean };
  metrics?: { targetImpressions?: number; targetCTR?: number };
  enabled?: boolean;
};
