import { Router } from 'express';
import {
  listAudience,
  scheduleCampaign,
  enqueueCampaign,
  loginStart,
  loginCallback,
} from '../controllers/campaign.controller';

export const router = Router();

router.get('/audience', listAudience);
router.post('/schedule', scheduleCampaign);
router.post('/queue', enqueueCampaign);
router.get('/login/start', loginStart);
router.get('/login/callback', loginCallback);
