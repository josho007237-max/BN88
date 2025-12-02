import { Router } from 'express';
import { handleWebhook } from '../controllers/webhook.controller';

export const router = Router();

router.post('/line', handleWebhook);
