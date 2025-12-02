import { BotFlow } from '../schemas/bot-flow.schema';

const flow: BotFlow = {
  version: '1.0',
  rules: [
    {
      id: 'greet',
      name: 'Greet hello',
      enabled: true,
      condition: { type: 'startsWith', value: 'สวัสดี' },
      actions: [
        {
          type: 'replyMessage',
          message: { type: 'text', text: 'สวัสดีครับ มีอะไรให้ช่วยไหม?' },
        },
      ],
    },
    {
      id: 'menu',
      name: 'Open Menu LIFF',
      enabled: true,
      condition: { type: 'textEquals', value: 'เมนู' },
      actions: [
        {
          type: 'replyMessage',
          message: { type: 'text', text: 'เปิดเมนูจาก LIFF ครับ' },
        },
        { type: 'openLIFF', liffId: 'LIFF_ID' },
      ],
    },
  ],
};

export const BotFlowEngine = {
  match: (text: string, source: any, _replyToken: string) => {
    const acts: { type: 'reply' | 'push'; messages: any[]; to?: string }[] = [];
    for (const rule of flow.rules.filter(r => r.enabled)) {
      const cond = rule.condition;
      let ok = false;
      if (cond.type === 'textEquals') ok = text === cond.value;
      if (cond.type === 'contains') ok = text.includes(cond.value);
      if (cond.type === 'startsWith') ok = text.startsWith(cond.value);
      if (!ok) continue;

      for (const a of rule.actions) {
        if (a.type === 'replyMessage') {
          acts.push({ type: 'reply', messages: [a.message] });
        }
        if (a.type === 'pushMessage' && source.userId) {
          acts.push({ type: 'push', to: source.userId, messages: [a.message] });
        }
      }
    }
    return acts;
  },

  matchPostback: (data: string, _source: any, _replyToken: string) => {
    return [
      { type: 'reply', messages: [{ type: 'text', text: `รับข้อมูล: ${data}` }] },
    ] as any[];
  },
};
