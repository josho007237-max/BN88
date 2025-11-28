import { Router } from "express";
import { z } from "zod";
import {
  createCampaign,
  getCampaign,
  getCampaignStatus,
  getLepHealth,
  listCampaigns,
  queueCampaign,
  LepClientError,
} from "../../services/lepClient";

const router = Router();

const buildSuccess = (result: { lepBaseUrl: string; status: number; data: any }) => ({
  ok: true,
  source: "lep",
  lepBaseUrl: result.lepBaseUrl,
  status: result.status,
  data: result.data,
});

const handleLepError = (err: any, res: any) => {
  const message = err instanceof LepClientError ? err.message : "lep_error";
  return res
    .status(502)
    .json({ ok: false, message: "lep_error", detail: message, lepBaseUrl: err?.lepBaseUrl });
};

router.get("/health", async (_req, res) => {
  try {
    const result = await getLepHealth();
    return res.json(buildSuccess(result));
  } catch (err: any) {
    return handleLepError(err, res);
  }
});

router.get("/campaigns", async (req, res) => {
  try {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
    const result = await listCampaigns({ page, pageSize });
    return res.json(buildSuccess(result));
  } catch (err: any) {
    return handleLepError(err, res);
  }
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
  targets: z.any().optional(),
});

router.post("/campaigns", async (req, res) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, message: "invalid_input", issues: parsed.error.issues });
  }

  try {
    const result = await createCampaign(parsed.data);
    return res.json(buildSuccess(result));
  } catch (err: any) {
    return handleLepError(err, res);
  }
});

router.post("/campaigns/:id/queue", async (req, res) => {
  try {
    const result = await queueCampaign(req.params.id);
    return res.json(buildSuccess(result));
  } catch (err: any) {
    return handleLepError(err, res);
  }
});

router.get("/campaigns/:id", async (req, res) => {
  try {
    const result = await getCampaign(req.params.id);
    return res.json(buildSuccess(result));
  } catch (err: any) {
    return handleLepError(err, res);
  }
});

router.get("/campaigns/:id/status", async (req, res) => {
  try {
    const result = await getCampaignStatus(req.params.id);
    return res.json(buildSuccess(result));
  } catch (err: any) {
    return handleLepError(err, res);
  }
});

export default router;
