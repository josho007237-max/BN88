import { Router } from 'express';
import { eventsFeed } from '../controllers/analytics.controller';

export const router = Router();

router.get('/events', eventsFeed);
