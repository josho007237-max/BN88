import { Request, Response } from 'express';
import { LineMessaging } from '../services/lineMessaging.service';

export const sendBroadcast = async (req: Request, res: Response) => {
  const { messages } = req.body;
  await LineMessaging.broadcast(messages);
  res.json({ ok: true });
};

export const sendFlexSample = async (_req: Request, res: Response) => {
  const flex = {
    type: 'flex',
    altText: 'โปรโมชันใหม่!',
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: 'https://picsum.photos/600/400',
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'Flash Sale', weight: 'bold', size: 'xl' },
          { type: 'text', text: 'ลด 30% วันนี้เท่านั้น', size: 'sm', color: '#555555' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#00B900',
            action: { type: 'uri', label: 'เปิดเมนู', uri: 'https://line.me' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: 'รับคูปอง', data: 'coupon=FLASH30' },
          },
        ],
      },
    },
  };
  res.json({ message: flex });
};
