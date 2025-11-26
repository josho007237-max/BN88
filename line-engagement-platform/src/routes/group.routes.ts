import { Router } from 'express';
import { groupSummary, postToGroup } from '../controllers/group.controller';

export const router = Router();

router.get('/summary', groupSummary);
router.post('/post', postToGroup);
