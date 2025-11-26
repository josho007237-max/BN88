import { http } from '../utils/axios';
import { env } from '../config/env';
import crypto from 'crypto';

const headers = (uri: string, body: any) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyStr = JSON.stringify(body);
  const signature = crypto
    .createHmac('sha256', env.PAY.CHANNEL_SECRET)
    .update(env.PAY.CHANNEL_SECRET + uri + bodyStr + nonce)
    .digest('base64');

  return {
    'Content-Type': 'application/json',
    'X-LINE-ChannelId': env.PAY.CHANNEL_ID,
    'X-LINE-Authorization-Nonce': nonce,
    'X-LINE-Authorization': signature,
  };
};

export const requestPayment = async (orderId: string, amount: number, currency = 'THB') => {
  const body = {
    amount,
    currency,
    orderId,
    packages: [{ id: 'pkg1', amount, name: 'Order package' }],
    redirectUrls: {
      confirmUrl: env.PAY.CONFIRM_URL,
      cancelUrl: env.PAY.CONFIRM_URL,
    },
  };
  const uri = '/v3/payments/request';
  const res = await http.post(env.PAY.BASE + uri, body, { headers: headers(uri, body) });
  return res.data;
};

export const confirmPayment = async (transactionId: string, amount: number, currency = 'THB') => {
  const body = { amount, currency };
  const uri = `/v3/payments/${transactionId}/confirm`;
  const res = await http.post(env.PAY.BASE + uri, body, { headers: headers(uri, body) });
  return res.data;
};
