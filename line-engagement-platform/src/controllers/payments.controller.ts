import { Request, Response } from 'express';
import { requestPayment, confirmPayment } from '../services/linePay.service';

export const createPayment = async (req: Request, res: Response) => {
  const { orderId, amount } = req.body;
  const data = await requestPayment(orderId, amount);
  res.json({
    ok: true,
    paymentUrl: data.info.paymentUrl.web,
    transactionId: data.info.transactionId,
  });
};

export const confirm = async (req: Request, res: Response) => {
  const { transactionId, amount } = req.body;
  const data = await confirmPayment(transactionId, amount);
  res.json({ ok: true, data });
};
