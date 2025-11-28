import { Router } from 'express';
import { CampaignApiController } from '../controllers/campaignApi.controller';

export const router = Router();

router.post('/', CampaignApiController.create);
router.get('/', CampaignApiController.list);
router.post('/:id/queue', CampaignApiController.queue);
router.get('/:id', CampaignApiController.get);
router.get('/:id/status', CampaignApiController.status);
