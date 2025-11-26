import { env } from '../config/env';
import { hmacSHA256 } from '../utils/crypto';

export const verifySignature = (bodyRaw: string, signature: string) => {
  const expected = hmacSHA256(env.LINE_CHANNEL_SECRET, bodyRaw);
  return signature === expected;
};
