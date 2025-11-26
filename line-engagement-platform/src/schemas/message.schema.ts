export type TextMessage = {
  type: 'text';
  text: string;
};

export type FlexMessage = {
  type: 'flex';
  altText: string;
  contents: any;
};

export type QuickReplyItem = {
  type: 'action';
  action: {
    type: 'message' | 'uri' | 'postback';
    label: string;
    text?: string;
    uri?: string;
    data?: string;
  };
};

export type MessagePayload = (TextMessage | FlexMessage) & {
  quickReply?: { items: QuickReplyItem[] };
};
