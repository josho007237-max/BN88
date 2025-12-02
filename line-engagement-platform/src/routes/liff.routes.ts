import { Router } from 'express';
import { liffInfo } from '../controllers/liff.controller';

export const router = Router();

router.get('/info', liffInfo);
