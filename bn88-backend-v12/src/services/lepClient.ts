import axios, { AxiosInstance } from "axios";
import { config } from "../config";

const lepBaseUrl = config.LEP_BASE_URL;

export class LepClientError extends Error {
  status?: number;
  data?: any;
  lepBaseUrl: string;

  constructor(message: string, lepBaseUrl: string, status?: number, data?: any) {
    super(message);
    this.lepBaseUrl = lepBaseUrl;
    this.status = status;
    this.data = data;
  }
}

const client: AxiosInstance = axios.create({
  baseURL: lepBaseUrl,
  timeout: 15000,
});

const toResult = (res: { status: number; data: any }) => ({
  lepBaseUrl,
  status: res.status,
  data: res.data,
});

const handleError = (err: any): never => {
  if (err?.response) {
    const { status, data } = err.response;
    throw new LepClientError(`LEP request failed with status ${status}`, lepBaseUrl, status, data);
  }
  if (err instanceof LepClientError) throw err;
  throw new LepClientError(err?.message || "LEP request failed", lepBaseUrl);
};

export async function getLepHealth() {
  try {
    const res = await client.get("/health");
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}

export async function listCampaigns(params: { page?: number; pageSize?: number }) {
  try {
    const res = await client.get("/campaigns", { params });
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}

export async function createCampaign(payload: { name: string; message: string; targets?: any }) {
  try {
    const res = await client.post("/campaigns", payload);
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}

export async function queueCampaign(id: string) {
  try {
    const res = await client.post(`/campaigns/${encodeURIComponent(id)}/queue`);
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}

export async function getCampaign(id: string) {
  try {
    const res = await client.get(`/campaigns/${encodeURIComponent(id)}`);
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}

export async function getCampaignStatus(id: string) {
  try {
    const res = await client.get(`/campaigns/${encodeURIComponent(id)}/status`);
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}

export async function listCampaignSchedules(id: string) {
  try {
    const res = await client.get(`/campaigns/${encodeURIComponent(id)}/schedules`);
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}

export async function createCampaignSchedule(
  id: string,
  payload: { cron: string; timezone: string; startAt?: string; endAt?: string; idempotencyKey?: string },
) {
  try {
    const res = await client.post(`/campaigns/${encodeURIComponent(id)}/schedules`, payload);
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}

export async function updateCampaignSchedule(
  id: string,
  scheduleId: string,
  payload: Partial<{ cron: string; timezone: string; startAt?: string | null; endAt?: string | null; enabled?: boolean; idempotencyKey?: string }>,
) {
  try {
    const res = await client.patch(
      `/campaigns/${encodeURIComponent(id)}/schedules/${encodeURIComponent(scheduleId)}`,
      payload,
    );
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}

export async function deleteCampaignSchedule(id: string, scheduleId: string) {
  try {
    const res = await client.delete(`/campaigns/${encodeURIComponent(id)}/schedules/${encodeURIComponent(scheduleId)}`);
    return toResult(res);
  } catch (err: any) {
    return handleError(err);
  }
}
