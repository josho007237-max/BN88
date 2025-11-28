import { http } from '../utils/axios';
import { env } from '../config/env';

const base = 'https://api.line.me/v2/bot';
const headers = {
  Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

export const LineMessaging = {
  reply: async (replyToken: string, messages: any[]) => {
    return http.post(`${base}/message/reply`, { replyToken, messages }, { headers });
  },
  push: async (to: string, messages: any[]) => {
    return http.post(`${base}/message/push`, { to, messages }, { headers });
  },
  multicast: async (to: string[], messages: any[]) => {
    return http.post(`${base}/message/multicast`, { to, messages }, { headers });
  },
  broadcast: async (messages: any[]) => {
    return http.post(`${base}/message/broadcast`, { messages }, { headers });
  },
  getProfile: async (userId: string) => {
    return http.get(`${base}/profile/${userId}`, { headers });
  },
  getRichMenuList: async () => {
    return http.get(`${base}/richmenu/list`, { headers });
  },
  linkRichMenuToUser: async (userId: string, richMenuId: string) => {
    return http.post(`${base}/richmenu/user/${userId}`, { richMenuId }, { headers });
  },
};
