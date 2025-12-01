import { env } from '../config/env';

export const getLiffSettings = () => ({
  liffId: env.LIFF_APP_ID,
  appUrl: '/liff-app/index.html',
});
