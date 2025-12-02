import { Router } from 'express';
import { createPayment, confirm } from '../controllers/payments.controller';

export const router = Router();

router.post('/create', createPayment);
router.post('/confirm', confirm);
