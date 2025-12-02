import { Request, Response } from 'express';
import { getLiffSettings } from '../services/liff.service';

export const liffInfo = (_req: Request, res: Response) => {
  res.json(getLiffSettings());
};
