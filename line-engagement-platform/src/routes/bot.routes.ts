import { Router } from 'express';
import { sendBroadcast, sendFlexSample } from '../controllers/bot.controller';

export const router = Router();

router.post('/broadcast', sendBroadcast);
router.get('/flex/sample', sendFlexSample);
