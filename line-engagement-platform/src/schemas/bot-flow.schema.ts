export type Condition =
  | { type: 'textEquals'; value: string }
  | { type: 'contains'; value: string }
  | { type: 'startsWith'; value: string }
  | { type: 'postbackData'; key: string; value?: string };

export type Action =
  | { type: 'replyMessage'; message: any }
  | { type: 'pushMessage'; to: string; message: any }
  | { type: 'openLIFF'; liffId: string }
  | { type: 'tagUser'; tag: string }
  | { type: 'emitConversion'; event: string; properties?: Record<string, any> };

export type BotRule = {
  id: string;
  name: string;
  condition: Condition;
  actions: Action[];
  enabled: boolean;
};

export type BotFlow = {
  version: '1.0';
  rules: BotRule[];
};
