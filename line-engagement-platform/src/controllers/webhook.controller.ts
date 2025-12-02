import { Request, Response } from 'express';
import { verifySignature } from '../services/lineWebhook.service';
import { LineMessaging } from '../services/lineMessaging.service';
import { BotFlowEngine } from './_botFlowEngine';
import { eventsBuffer } from '../store/eventsBuffer';
import { AudienceRepo } from '../repositories/audience.repo';
import { EventRepo } from '../repositories/event.repo';

export const handleWebhook = async (req: Request, res: Response) => {
  const rawBody = JSON.stringify(req.body);
  const signature = req.header('x-line-signature') || '';
  if (!verifySignature(rawBody, signature)) {
    return res.status(401).send('Invalid signature');
  }

  const events = req.body.events || [];
  for (const ev of events) {
    eventsBuffer.push(ev);

    if (ev.source?.userId) {
      await AudienceRepo.upsertByLineUser(ev.source.userId, { lastActiveAt: new Date() });
    }

    const audienceId = ev.source?.userId
      ? (await AudienceRepo.upsertByLineUser(ev.source.userId, {})).id
      : undefined;

    await EventRepo.record(ev.type, ev, audienceId);

    if (ev.type === 'follow' && ev.replyToken) {
      if (ev.source?.userId) {
        await AudienceRepo.addTag(ev.source.userId, 'follower');
      }
      await LineMessaging.reply(ev.replyToken, [
        { type: 'text', text: 'ยินดีต้อนรับครับ 🎉' },
      ]);
    }

    if (ev.type === 'message' && ev.message.type === 'text') {
      const replyActions = BotFlowEngine.match(ev.message.text, ev.source, ev.replyToken);
      for (const act of replyActions) {
        if (act.type === 'reply') {
          await LineMessaging.reply(ev.replyToken, act.messages);
        }
        if (act.type === 'push' && ev.source?.userId) {
          await LineMessaging.push(ev.source.userId, act.messages);
        }
      }
    }

    if (ev.type === 'postback' && ev.replyToken) {
      const data = ev.postback.data || '';
      const actions = BotFlowEngine.matchPostback(data, ev.source, ev.replyToken);
      for (const act of actions) {
        if (act.type === 'reply') {
          await LineMessaging.reply(ev.replyToken, act.messages);
        }
      }
      if (ev.source?.userId) {
        await AudienceRepo.addTag(ev.source.userId, 'engaged');
      }
    }
  }

  res.status(200).send('ok');
};
