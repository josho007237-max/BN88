import { http } from '../utils/axios';
import { env } from '../config/env';

export const emitConversion = async (eventName: string, payload: Record<string, any>) => {
  const url = 'https://api.line.biz/ads/conversion/events';
  return http.post(
    url,
    { event: eventName, properties: payload },
    {
      headers: {
        Authorization: `Bearer ${env.ADS_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    },
  );
};
