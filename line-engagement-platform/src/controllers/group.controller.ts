import { Request, Response } from 'express';
import { LineMessaging } from '../services/lineMessaging.service';
import { store } from '../store/memoryStore';

export const groupSummary = async (_req: Request, res: Response) => {
  const groups = Array.from(store.groups.entries()).map(([id, g]) => ({ id, ...g }));
  res.json({ groups });
};

export const postToGroup = async (req: Request, res: Response) => {
  const { groupId, messages } = req.body;
  await LineMessaging.push(groupId, messages);
  res.json({ ok: true });
};
