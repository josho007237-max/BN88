// src/types/api.ts

/* =========================
 * Common
 * ========================= */
export type Channel = "line" | "facebook" | "ig" | "web" | "telegram";

export type ApiOK = { ok: true };
export type ApiFail = { ok: false; code?: string; message?: string };
export type ApiResult<T> = (ApiOK & T) | ApiFail;

/* =========================
 * Bots
 * ========================= */
export type BotItem = {
  id: string;
  name?: string | null;                 // โน้ต/ชื่อบอท (แก้ได้)
  platform?: Channel | null;
  tenant?: string | null;               // เช่น "bn9"
  createdAt?: string;                   // ISO
  updatedAt?: string | null;            // ISO
  active?: boolean;                     // เปิด/ปิดบอท
};

export type BotListResponse = { items: BotItem[] };

export type BotGetResponse = {
  bot: {
    id: string;
    name?: string | null;
    platform: string;       // สอดคล้องฟิลด์ฝั่ง UI; ฝั่ง DB ใช้ provider ก็ได้
    tenant: string;
    createdAt: string;
    updatedAt?: string;
    active?: boolean;
  };
};

/* =========================
 * Dashboard Cards (UI-only helper)
 * ========================= */
export type CardsResponse = {
  total: number;
  newUsers: number;
  urgent: number;
  dup15m: number;
};

/* =========================
 * Daily Stats
 * ========================= */
export type DailyPoint = { date: string; messages: number };

export type DailyResponse = {
  ok: boolean;
  tenant: string;
  days: number;
  data: DailyPoint[];
};

// UI alias (ถ้าโค้ดหน้า Dashboard ยังอ้าง msg/newUsers/urgent)
export type DailyPointUI = {
  date: string;
  msg: number;
  newUsers: number;
  urgent: number;
};

/* =========================
 * Summary
 * ========================= */
export type StatsSummary = {
  ok: boolean;
  tenant: string;
  window: { sinceDays: number; fromUTC: string; toUTC: string };
  totals: { messages: number; cases: number; bots: number };
};

/* =========================
 * Recent Cases
 * ========================= */
export type RecentCase = {
  id: string;
  user: string;
  channel: Channel;
  subject: string;
  urgent: boolean;
  createdAt: string; // ISO
};
export type RecentCasesResponse = { items: RecentCase[] };

/* =========================
 * Secrets
 * ========================= */
export type BotSecretsPayload = {
  // --- OpenAI ---
  openaiApiKey?: string;
  openAiApiKey?: string;          // alias casing (maps to openaiApiKey)

  // legacy aliases (รองรับโค้ดเดิม)
  openaiKey?: string;               // -> normalize เป็น openaiApiKey

  // --- LINE ---
  lineChannelSecret?: string;
  lineSecret?: string;              // -> normalize เป็น lineChannelSecret
  lineAccessToken?: string;

  // --- Telegram ---
  telegramToken?: string;

  // --- Facebook ---
  facebookPageToken?: string;
  facebookVerifyToken?: string;
};

// เมื่อดึงมาโชว์ในฟอร์ม (เป็น partial ได้ทั้งหมด และอาจเป็น masked string เช่น "****abcd")
export type BotSecretsMasked = Partial<BotSecretsPayload>;

export type BotSecretsSavedFlags = {
  openaiApiKey: boolean;
  lineAccessToken: boolean;
  lineChannelSecret: boolean;
};

export type BotSecretsSaveResponse = ApiOK & {
  botId: string;
  saved: BotSecretsSavedFlags;
};

export type BotSecretsResponse = ApiOK & BotSecretsMasked;
