import { http } from '../utils/axios';
import { env } from '../config/env';
import qs from 'querystring';

export const getLoginUrl = (state: string) => {
  const q = qs.stringify({
    response_type: 'code',
    client_id: env.LOGIN.ID,
    redirect_uri: env.LOGIN.REDIRECT,
    state,
    scope: 'profile openid email',
    prompt: 'consent',
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${q}`;
};

export const exchangeToken = async (code: string) => {
  const data = qs.stringify({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.LOGIN.REDIRECT,
    client_id: env.LOGIN.ID,
    client_secret: env.LOGIN.SECRET,
  });
  const res = await http.post('https://api.line.me/oauth2/v2.1/token', data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.data;
};

export const getProfile = async (accessToken: string) => {
  const res = await http.get('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data;
};
