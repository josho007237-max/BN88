/// <reference types="vite/client" />

import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
  type AxiosRequestHeaders,
} from "axios";

/* ============================ Local Types ============================ */

export type Health = { ok: boolean; time?: string; adminApi?: boolean };

export type BotPlatform = "line" | "telegram" | "facebook";

export type BotItem = {
  id: string;
  name: string;
  platform: BotPlatform;
  active: boolean;
  tenant?: string | null;
  verifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type BotListResponse = { ok: boolean; items: BotItem[] };
export type BotGetResponse = { ok: boolean; bot: BotItem };

export type BotSecretsPayload = {
  openaiApiKey?: string | null;
  openAiApiKey?: string | null; // casing alias
  lineAccessToken?: string | null;
  lineChannelSecret?: string | null;

  // alias เดิม (เผื่อ UI เก่า)
  openaiKey?: string | null;
  lineSecret?: string | null;
};

export type BotSecretsMasked = {
  ok?: boolean;
  openaiApiKey?: string; // "********" ถ้ามีค่า
  lineAccessToken?: string; // "********" ถ้ามีค่า
  lineChannelSecret?: string; // "********" ถ้ามีค่า
};

export type BotSecretsSaveResponse = {
  ok: boolean;
  botId: string;
  saved: {
    openaiApiKey: boolean;
    lineAccessToken: boolean;
    lineChannelSecret: boolean;
  };
};

export type CaseItem = {
  id: string;
  botId: string;
  userId?: string | null;
  text?: string | null;
  kind?: string | null;
  createdAt?: string;
};
export type RecentCasesResponse = { ok: boolean; items: CaseItem[] };

export type DailyStat = {
  botId: string;
  dateKey: string;
  total: number;
  text: number;
  follow: number;
  unfollow: number;
};
export type DailyResp = { ok: boolean; dateKey: string; stats: DailyStat };

export type RangeItem = {
  dateKey: string;
  total: number;
  text: number;
  follow: number;
  unfollow: number;
};
export type RangeResp = {
  ok: boolean;
  items: RangeItem[];
  summary: { total: number; text: number; follow: number; unfollow: number };
};

/* ---- Bot Intents ---- */
export type BotIntent = {
  id: string;
  tenant: string;
  botId: string;
  code: string;
  title: string;
  keywords: string[] | null;
  fallback?: string | null;
  createdAt: string;
  updatedAt: string;
};

/* ---- Bot AI Config (per bot) ---- */
export type BotAiConfig = {
  botId: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
};

export type BotAiConfigResponse = {
  ok: boolean;
  config: BotAiConfig;
  allowedModels: string[];
};

/* ---- Chat Center types ---- */

export type ChatSession = {
  id: string;
  botId: string;
  platform: BotPlatform | string;
  userId: string;

  // ข้อมูลผู้ใช้
  displayName?: string | null;
  userName?: string | null;
  userAvatar?: string | null;

  // เวลา / สถานะล่าสุด
  lastMessageAt: string;
  firstMessageAt?: string | null;
  lastText?: string | null;
  lastDirection?: "user" | "bot" | "admin" | string | null;

  // ฟิลด์ใหม่สำหรับจัดการเคสใน Chat Center
  status?: string | null;        // เช่น "open" | "pending" | "closed"
  tags?: string[] | null;        // แปลงมาจาก JSON string ใน DB
  adminNote?: string | null;     // โน้ตของแอดมิน

  createdAt?: string;
  updatedAt?: string;
  tenant?: string;
};

export type ChatMessage = {
  id: string;
  sessionId: string;

  tenant: string;
  botId: string;
  platform: string | null;

  senderType: "user" | "bot" | "admin";
  messageType: string; // ส่วนใหญ่เป็น "text"
  text: string;

  platformMessageId?: string | null;
  meta?: unknown;

  createdAt: string;
  updatedAt?: string;
};

export type ReplyChatSessionResponse = {
  ok: boolean;
  message?: ChatMessage;
  error?: string;
};

export type ChatSessionUpdateResponse = {
  ok: boolean;
  session: ChatSession;
};

/* ---- Knowledge types ---- */

export type KnowledgeDoc = {
  id: string;
  tenant: string;
  title: string;
  tags?: string | null;
  body: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { chunks: number; bots: number };
};

export type KnowledgeDocDetail = KnowledgeDoc & {
  bots?: { botId: string; docId: string; bot?: BotItem }[];
};

export type KnowledgeChunk = {
  id: string;
  tenant: string;
  docId: string;
  content: string;
  embedding?: unknown;
  tokens: number;
  createdAt: string;
  updatedAt?: string;
};

export type KnowledgeListResponse = {
  ok: boolean;
  items: KnowledgeDoc[];
  page: number;
  limit: number;
  total: number;
  pages: number;
};

/* ---- LEP monitor types ---- */

export type LepHealthResponse = {
  ok: boolean;
  target: "lep";
  lepBaseUrl: string;
  status: string;
  lepResponse?: unknown;
};

/* ================================ Base ================================ */

export const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(
  /\/+$/,
  ""
);
const TENANT = import.meta.env.VITE_TENANT || "bn9";

// ต้องใช้ key ตัวนี้เหมือนกันใน main.tsx และ Login.tsx
const TOKEN_KEY = "bn9.admin.token";

/* ======================= Token helpers ======================= */

(function migrateLegacyToken() {
  try {
    const legacy = localStorage.getItem("BN9_TOKEN");
    if (legacy && !localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem("BN9_TOKEN");
    }
  } catch {
    // ignore
  }
})();

function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(t: string) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    // ignore
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

let accessToken = getToken();

/* ================================ Axios ================================ */

export const API = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

API.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const headers = (cfg.headers ?? {}) as AxiosRequestHeaders;
  accessToken ||= getToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  headers["x-tenant"] = TENANT;
  cfg.headers = headers;
  return cfg;
});

API.interceptors.response.use(
  (r) => r,
  (err: AxiosError<any>) => {
    const status = err.response?.status;
    if (status === 401) {
      clearToken();
      accessToken = "";
      const loc = globalThis.location;
      if (loc && loc.pathname !== "/login") loc.href = "/login";
    }
    return Promise.reject(err);
  }
);

/* ================================ Utils ================================ */

export function getApiBase() {
  return API_BASE;
}

/* ================================= Auth ================================ */

export async function login(email: string, password: string) {
  const r = await API.post<{ ok: boolean; token: string }>("/auth/login", {
    email,
    password,
  });
  if (!r.data?.token) throw new Error("login failed: empty token");
  setToken(r.data.token);
  accessToken = r.data.token;
  return r.data;
}

export function logoutAndRedirect() {
  clearToken();
  accessToken = "";
  globalThis.location?.assign("/login");
}

/* ============================== Bots APIs ============================== */

export async function getBots() {
  return (await API.get<BotListResponse>("/bots")).data;
}

export async function initBot(
  platform: BotPlatform = "line"
): Promise<BotItem> {
  const res = await API.post<{ ok: true; bot: BotItem }>("/bots/init", {
    platform,
  });
  return res.data.bot;
}

export async function getBot(botId: string) {
  return (
    await API.get<BotGetResponse>(`/bots/${encodeURIComponent(botId)}`)
  ).data;
}

export async function updateBotMeta(
  botId: string,
  payload: Partial<{
    name: string | null;
    active: boolean;
    verifiedAt?: string | null;
  }>
) {
  return (
    await API.patch<{ ok: true; bot?: BotItem }>(
      `/admin/bots/${encodeURIComponent(botId)}`,
      payload
    )
  ).data;
}

/* ----- Secrets ----- */

export async function getBotSecrets(botId: string) {
  return (
    await API.get<BotSecretsMasked>(
      `/admin/bots/${encodeURIComponent(botId)}/secrets`
    )
  ).data;
}

export async function updateBotSecrets(
  botId: string,
  payload: BotSecretsPayload
) {
  const norm: BotSecretsPayload = {
    ...payload,
    openaiApiKey:
      payload.openaiApiKey ??
      payload.openAiApiKey ??
      payload.openaiKey ??
      undefined,
    lineChannelSecret:
      payload.lineChannelSecret ?? payload.lineSecret ?? undefined,
  };

  const body: Record<string, string> = {};

  if (norm.openaiApiKey && norm.openaiApiKey !== "********")
    body.openaiApiKey = norm.openaiApiKey.trim();

  if (norm.lineAccessToken && norm.lineAccessToken !== "********")
    body.lineAccessToken = norm.lineAccessToken.trim();

  if (norm.lineChannelSecret && norm.lineChannelSecret !== "********")
    body.lineChannelSecret = norm.lineChannelSecret.trim();

  return (
    await API.post<BotSecretsSaveResponse>(
      `/admin/bots/${encodeURIComponent(botId)}/secrets`,
      body
    )
  ).data;
}

/** DELETE bot (admin) */
export async function deleteBot(botId: string) {
  try {
    await API.delete(`/admin/bots/${encodeURIComponent(botId)}`);
    return { ok: true as const };
  } catch {
    // เผื่อ backend ยังไม่ implement DELETE ให้ไม่พังหน้าเว็บ
    return { ok: true as const, note: "DELETE not implemented on server" };
  }
}

/* ============================ Stats / Cases ============================ */

export async function getDailyByBot(botId: string) {
  return (await API.get<DailyResp>("/stats/daily", { params: { botId } })).data;
}

export async function getRangeByBot(botId: string, from: string, to: string) {
  return (
    await API.get<RangeResp>("/stats/range", { params: { botId, from, to } })
  ).data;
}

export async function getRecentByBot(botId: string, limit = 20) {
  return (
    await API.get<RecentCasesResponse>("/cases/recent", {
      params: { botId, limit },
    })
  ).data;
}

export async function getDailyStats(tenant: string) {
  return (await API.get(`/stats/${encodeURIComponent(tenant)}/daily`)).data;
}

/* ============================== Dev tools ============================== */

export async function devLinePing(botId: string) {
  try {
    return (
      await API.get<{ ok: boolean; status: number }>(
        `/dev/line-ping/${encodeURIComponent(botId)}`
      )
    ).data;
  } catch {
    // fallback route เก่า (ถ้ามี)
    return (
      await API.get<{ ok: boolean; status: number }>(
        `/line-ping/${encodeURIComponent(botId)}`
      )
    ).data;
  }
}

/* ============================== Bot Intents APIs ============================== */

export async function getBotIntents(botId: string): Promise<BotIntent[]> {
  const res = await API.get<{ ok: boolean; items: BotIntent[] }>(
    `/admin/bots/${encodeURIComponent(botId)}/intents`
  );
  return res.data.items ?? [];
}

export async function createBotIntent(
  botId: string,
  payload: {
    code: string;
    title: string;
    keywords?: string | string[];
    fallback?: string;
  }
): Promise<BotIntent> {
  const res = await API.post<{ ok: boolean; item: BotIntent }>(
    `/admin/bots/${encodeURIComponent(botId)}/intents`,
    payload
  );
  return res.data.item;
}

export async function updateBotIntent(
  botId: string,
  id: string,
  payload: {
    code?: string;
    title?: string;
    keywords?: string | string[];
    fallback?: string | null;
  }
): Promise<BotIntent> {
  const res = await API.put<{ ok: boolean; item: BotIntent }>(
    `/admin/bots/${encodeURIComponent(botId)}/intents/${encodeURIComponent(
      id
    )}`,
    payload
  );
  return res.data.item;
}

export async function deleteBotIntent(
  botId: string,
  id: string
): Promise<void> {
  await API.delete(
    `/admin/bots/${encodeURIComponent(botId)}/intents/${encodeURIComponent(id)}`
  );
}

/* ============================== Bot AI Config APIs ============================== */

export async function getBotConfig(
  botId: string
): Promise<BotAiConfigResponse> {
  const res = await API.get<BotAiConfigResponse>(
    `/admin/bots/${encodeURIComponent(botId)}/config`
  );
  return res.data; // { ok, config, allowedModels }
}

export async function updateBotConfig(
  botId: string,
  payload: Partial<BotAiConfig>
): Promise<BotAiConfigResponse> {
  const res = await API.put<BotAiConfigResponse>(
    `/admin/bots/${encodeURIComponent(botId)}/config`,
    payload
  );
  return res.data;
}

/* ============================== Chat Center APIs ============================== */

/**
 * GET /api/admin/chat/sessions?botId=...&limit=...
 */
export async function getChatSessions(
  botId: string,
  limit = 50,
  platform?: string
): Promise<ChatSession[]> {
  const res = await API.get<{ ok: boolean; items?: ChatSession[]; sessions?: ChatSession[] }>(
    "/admin/chat/sessions",
    { params: { botId, limit, platform } }
  );
  const data = res.data as any;
  return data.items ?? data.sessions ?? [];
}

/**
 * GET /api/admin/chat/sessions/:sessionId/messages?limit=...
 */
export async function getChatMessages(
  sessionId: string,
  limit = 100
): Promise<ChatMessage[]> {
  const res = await API.get<{ ok: boolean; items?: ChatMessage[]; messages?: ChatMessage[] }>(
    `/admin/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    { params: { limit } }
  );
  const data = res.data as any;
  return data.items ?? data.messages ?? [];
}

/**
 * POST /api/admin/chat/sessions/:id/reply
 */
export async function replyChatSession(
  sessionId: string,
  text: string
): Promise<ReplyChatSessionResponse> {
  const res = await API.post<ReplyChatSessionResponse>(
    `/admin/chat/sessions/${encodeURIComponent(sessionId)}/reply`,
    { text }
  );
  return res.data;
}

/**
 * PATCH /api/admin/chat/sessions/:id
 * อัปเดต displayName / adminNote / tags
 */
export async function updateChatSession(
  sessionId: string,
  payload: Partial<{
    displayName: string;
    adminNote: string | null;
    tags: string[];
  }>
): Promise<ChatSessionUpdateResponse> {
  const res = await API.patch<ChatSessionUpdateResponse>(
    `/admin/chat/sessions/${encodeURIComponent(sessionId)}`,
    payload
  );
  return res.data;
}

/**
 * PATCH /api/admin/chat/sessions/:id/meta
 * อัปเดต status + tags
 */
export async function updateChatSessionMeta(
  sessionId: string,
  payload: { status?: string; tags?: string[] }
): Promise<{ ok: boolean }> {
  const res = await API.patch<{ ok: boolean }>(
    `/admin/chat/sessions/${encodeURIComponent(sessionId)}/meta`,
    payload
  );
  return res.data;
}

/* ============================== Knowledge APIs ============================== */

export async function listKnowledgeDocs(params?: {
  q?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<KnowledgeListResponse> {
  const res = await API.get<KnowledgeListResponse>("/admin/ai/knowledge/docs", {
    params,
  });
  return res.data;
}

export async function getKnowledgeDoc(
  id: string
): Promise<{ ok: boolean; item: KnowledgeDocDetail }> {
  const res = await API.get<{ ok: boolean; item: KnowledgeDocDetail }>(
    `/admin/ai/knowledge/docs/${encodeURIComponent(id)}`
  );
  return res.data;
}

export async function createKnowledgeDoc(payload: {
  title: string;
  tags?: string;
  body?: string;
  status?: string;
}): Promise<{ ok: boolean; item: KnowledgeDoc }> {
  const res = await API.post<{ ok: boolean; item: KnowledgeDoc }>(
    "/admin/ai/knowledge/docs",
    payload
  );
  return res.data;
}

export async function updateKnowledgeDoc(
  id: string,
  payload: Partial<{ title: string; tags?: string; body?: string; status?: string }>
): Promise<{ ok: boolean; item: KnowledgeDoc }> {
  const res = await API.patch<{ ok: boolean; item: KnowledgeDoc }>(
    `/admin/ai/knowledge/docs/${encodeURIComponent(id)}`,
    payload
  );
  return res.data;
}

export async function deleteKnowledgeDoc(id: string) {
  await API.delete(`/admin/ai/knowledge/docs/${encodeURIComponent(id)}`);
  return { ok: true as const };
}

export async function listKnowledgeChunks(
  docId: string
): Promise<{ ok: boolean; items: KnowledgeChunk[] }> {
  const res = await API.get<{ ok: boolean; items: KnowledgeChunk[] }>(
    `/admin/ai/knowledge/docs/${encodeURIComponent(docId)}/chunks`
  );
  return res.data;
}

export async function createKnowledgeChunk(
  docId: string,
  payload: { content: string; tokens?: number }
): Promise<{ ok: boolean; item: KnowledgeChunk }> {
  const res = await API.post<{ ok: boolean; item: KnowledgeChunk }>(
    `/admin/ai/knowledge/docs/${encodeURIComponent(docId)}/chunks`,
    payload
  );
  return res.data;
}

export async function updateKnowledgeChunk(
  chunkId: string,
  payload: Partial<{ content: string; tokens?: number; embedding?: unknown }>
): Promise<{ ok: boolean; item: KnowledgeChunk }> {
  const res = await API.patch<{ ok: boolean; item: KnowledgeChunk }>(
    `/admin/ai/knowledge/chunks/${encodeURIComponent(chunkId)}`,
    payload
  );
  return res.data;
}

export async function deleteKnowledgeChunk(chunkId: string) {
  await API.delete(
    `/admin/ai/knowledge/chunks/${encodeURIComponent(chunkId)}`
  );
  return { ok: true as const };
}

export async function getBotKnowledge(botId: string): Promise<{
  ok: boolean;
  botId: string;
  items: KnowledgeDoc[];
  docIds: string[];
}> {
  const res = await API.get<{
    ok: boolean;
    botId: string;
    items: KnowledgeDoc[];
    docIds: string[];
  }>(`/admin/ai/knowledge/bots/${encodeURIComponent(botId)}/knowledge`);
  return res.data;
}

export async function addBotKnowledge(botId: string, docId: string) {
  await API.post(
    `/admin/ai/knowledge/bots/${encodeURIComponent(botId)}/knowledge`,
    { docId }
  );
  return { ok: true as const };
}

export async function removeBotKnowledge(botId: string, docId: string) {
  await API.delete(
    `/admin/ai/knowledge/bots/${encodeURIComponent(
      botId
    )}/knowledge/${encodeURIComponent(docId)}`
  );
  return { ok: true as const };
}

/* ============================== LEP monitor ============================== */

export async function lepHealth(): Promise<LepHealthResponse> {
  const res = await API.get<LepHealthResponse>("/admin/lep/health");
  return res.data;
}

/* ============================= Helper bundle ============================ */

export const api = {
  base: getApiBase(),
  health: async () => (await API.get<Health>("/health")).data,

  // Stats
  daily: getDailyByBot,
  range: getRangeByBot,
  recent: getRecentByBot,
  dailyTenant: getDailyStats,

  // Bots
  bots: getBots,
  createBot: initBot,
  getBot,
  updateBotMeta,
  deleteBot,

  // Secrets
  getBotSecrets,
  updateBotSecrets,

  // Dev
  devLinePing,

  // Intents
  getBotIntents,
  createBotIntent,
  updateBotIntent,
  deleteBotIntent,

  // AI Config
  getBotConfig,
  updateBotConfig,

  // Chat Center
  getChatSessions,
  getChatMessages,
  replyChatSession,
  updateChatSession,
  updateChatSessionMeta,

  // Knowledge
  listKnowledgeDocs,
  getKnowledgeDoc,
  createKnowledgeDoc,
  updateKnowledgeDoc,
  deleteKnowledgeDoc,
  listKnowledgeChunks,
  createKnowledgeChunk,
  updateKnowledgeChunk,
  deleteKnowledgeChunk,
  getBotKnowledge,
  addBotKnowledge,
  removeBotKnowledge,

  // LEP monitor
  lepHealth,
};
