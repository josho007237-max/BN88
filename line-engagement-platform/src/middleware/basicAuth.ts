import { Request, Response, NextFunction } from 'express';
import basicAuth from 'basic-auth';
import { env } from '../config/env';

export const basicAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const user = basicAuth(req);
  if (!user || user.name !== env.BULL_BOARD_USER || user.pass !== env.BULL_BOARD_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Bull Board"');
    return res.status(401).send('Authentication required.');
  }
  return next();
};
