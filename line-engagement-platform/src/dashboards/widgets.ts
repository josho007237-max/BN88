export const Widgets = {
  BotBroadcast: {
    label: 'Broadcast',
    endpoint: '/bot/broadcast',
    payloadExample: { messages: [{ type: 'text', text: 'ประกาศจากระบบ' }] },
  },
  FlexSample: {
    label: 'Flex sample',
    endpoint: '/bot/flex/sample',
  },
  CampaignSchedule: {
    label: 'Schedule campaign',
    endpoint: '/campaign/schedule',
    payloadExample: {
      campaign: {
        id: 'c1',
        name: 'Promo Thai',
        schedule: { startAt: new Date().toISOString() },
        segment: { type: 'tag', tags: ['logged_in'] },
        message: { type: 'text', text: 'ส่วนลดพิเศษสำหรับสมาชิก' },
        channels: { line: true },
        enabled: true,
      },
    },
  },
  CampaignQueue: {
    label: 'Queue campaign',
    endpoint: '/campaign/queue',
  },
  AnalyticsEvents: {
    label: 'Events feed',
    endpoint: '/analytics/events',
  },
  PaymentsCreate: {
    label: 'Create payment',
    endpoint: '/payments/create',
    payloadExample: { orderId: 'ORD123', amount: 99 },
  },
};
