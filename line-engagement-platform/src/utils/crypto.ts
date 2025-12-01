import crypto from 'crypto';

export const hmacSHA256 = (key: string, body: string) =>
  crypto.createHmac('sha256', key).update(body).digest('base64');
